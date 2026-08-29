import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { normalizeUrl, urlBelongsToHostname, type SubmitUrlsInput } from '@foxindex/validation';
import {
  DomainVerificationStatus,
  SubmissionFailureReason,
  SubmissionProvider,
  UrlSubmissionState,
  type SubmissionJobPayload,
} from '@foxindex/types';
import { enqueueSubmissionJob } from '@foxindex/queue';
import { NotFoundError } from '../../common/errors/app-error';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { DomainsService } from '../domains/domains.service';
import { UrlsRepository } from '../urls/urls.repository';
import { SUBMISSION_QUEUE } from '../../queues/submission-queue.provider';
import { SubmissionsRepository, type ListSubmissionsFilters } from './submissions.repository';

export interface SubmissionActor {
  userId?: string;
  apiKeyId?: string;
}

export interface AcceptedSubmission {
  id: string;
  urlId: string;
  normalizedUrl: string;
  state: UrlSubmissionState;
}

export interface RejectedUrl {
  url: string;
  reason: SubmissionFailureReason;
  message: string;
}

@Injectable()
export class SubmissionsService {
  constructor(
    @Inject(SubmissionsRepository) private readonly submissions: SubmissionsRepository,
    @Inject(UrlsRepository) private readonly urlsRepo: UrlsRepository,
    @Inject(DomainsService) private readonly domains: DomainsService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(SUBMISSION_QUEUE) private readonly submissionQueue: Queue<SubmissionJobPayload>,
  ) {}

  /**
   * The submission POST flow (constitution §17/§37): normalize + dedupe each
   * URL, reject anything that doesn't belong to the given (verified) domain
   * without creating a row for it, then accept + enqueue the rest. A rejected
   * URL never gets a url_submissions row — rejection happens before the row
   * would exist, not as a state the row passes through.
   *
   * Processed sequentially, not with Promise.all — bounded by the request's
   * own URL count cap (packages/validation's MAX_URLS_PER_SUBMISSION_REQUEST),
   * and avoids bursting the DB pool's connection limit on a large batch.
   * Revisit with real bounded-concurrency batching if this measurably matters
   * (constitution §28: optimize based on measured bottlenecks, not
   * preemptively).
   */
  async submitUrls(
    organizationId: string,
    projectId: string,
    input: SubmitUrlsInput,
    actor: SubmissionActor,
  ): Promise<{ submissions: AcceptedSubmission[]; rejected: RejectedUrl[] }> {
    const domain = await this.domains.findOne(projectId, input.domainId);

    const accepted: AcceptedSubmission[] = [];
    const rejected: RejectedUrl[] = [];

    for (const rawUrl of input.urls) {
      let normalized: ReturnType<typeof normalizeUrl>;
      try {
        normalized = normalizeUrl(rawUrl);
      } catch {
        rejected.push({
          url: rawUrl,
          reason: SubmissionFailureReason.INVALID_URL,
          message: 'Could not parse this URL',
        });
        continue;
      }

      if (!urlBelongsToHostname(normalized.normalizedUrl, domain.hostname)) {
        rejected.push({
          url: rawUrl,
          reason: SubmissionFailureReason.INVALID_URL,
          message: `URL does not belong to domain ${domain.hostname}`,
        });
        continue;
      }

      if (domain.verificationStatus !== DomainVerificationStatus.VERIFIED) {
        rejected.push({
          url: rawUrl,
          reason: SubmissionFailureReason.DOMAIN_NOT_VERIFIED,
          message: 'Domain must be verified before submitting URLs',
        });
        continue;
      }

      const urlRow = await this.urlsRepo.upsert({
        organizationId,
        projectId,
        domainId: domain.id,
        rawUrl,
        normalizedUrl: normalized.normalizedUrl,
        normalizedUrlHash: normalized.normalizedUrlHash,
        createdByUserId: actor.userId,
      });

      const submission = await this.submissions.create({
        organizationId,
        projectId,
        urlId: urlRow.id,
        provider: SubmissionProvider.INDEXNOW,
        requestedByUserId: actor.userId,
        requestedByApiKeyId: actor.apiKeyId,
      });

      const payload: SubmissionJobPayload = {
        organizationId,
        projectId,
        domainId: domain.id,
        urlId: urlRow.id,
        urlSubmissionId: submission.id,
        provider: SubmissionProvider.INDEXNOW,
        jobType: 'URL_SUBMISSION',
        attempt: 1,
        requestedAt: new Date().toISOString(),
      };
      // jobId = urlSubmissionId inside enqueueSubmissionJob gives BullMQ-level
      // dedupe on top of the Redis idempotency cache further up the stack.
      await enqueueSubmissionJob(this.submissionQueue, payload);
      await this.submissions.markQueued(submission.id);

      accepted.push({
        id: submission.id,
        urlId: urlRow.id,
        normalizedUrl: urlRow.normalizedUrl,
        state: UrlSubmissionState.QUEUED,
      });
    }

    if (accepted.length > 0) {
      await this.auditLog.record({
        organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: actor.apiKeyId,
        action: 'url.submitted',
        resourceType: 'project',
        resourceId: projectId,
        metadata: { domainId: domain.id, acceptedCount: accepted.length, rejectedCount: rejected.length },
      });
    }

    return { submissions: accepted, rejected };
  }

  findAllForProject(projectId: string, filters: ListSubmissionsFilters) {
    return this.submissions.findAllForProject(projectId, filters);
  }

  async findOne(projectId: string, submissionId: string) {
    const submission = await this.submissions.findByIdForProject(projectId, submissionId);
    if (!submission) throw new NotFoundError('Submission');
    return submission;
  }
}
