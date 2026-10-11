import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Database } from '@foxindex/database';
import { normalizeUrl, type SubmitUrlsInput } from '@foxindex/validation';
import {
  CreditLedgerReason,
  SubmissionFailureReason,
  SubmissionProvider,
  UrlSubmissionState,
  type SubmissionJobPayload,
} from '@foxindex/types';
import { enqueueSubmissionJob } from '@foxindex/queue';
import { NotFoundError } from '../../common/errors/app-error';
import type { ProjectRow } from '../../common/guards/project-ownership.guard';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CreditsRepository } from '../credits/credits.repository';
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
  hostname: string;
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
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(CreditsRepository) private readonly credits: CreditsRepository,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SUBMISSION_QUEUE) private readonly submissionQueue: Queue<SubmissionJobPayload>,
  ) {}

  /**
   * The submission POST flow (constitution §17/§37): normalize + dedupe each
   * URL, reject anything the project's owner doesn't have a credit to pay
   * for, then accept + enqueue the rest. Every URL in the batch submits
   * under the *project's own* single IndexNow key (docs/adr/0013) — there is
   * no per-hostname domain lookup anymore; IndexNow itself is what rejects a
   * URL whose host doesn't actually serve that key (docs/adr/0010's "let
   * IndexNow decide" philosophy, now the only remaining check of this kind).
   * A rejected URL never gets a url_submissions row — rejection happens
   * before the row would exist, not as a state the row passes through.
   *
   * Processed sequentially, not with Promise.all — bounded by the request's
   * own URL count cap (packages/validation's MAX_URLS_PER_SUBMISSION_REQUEST),
   * and avoids bursting the DB pool's connection limit on a large batch.
   * Revisit with real bounded-concurrency batching if this measurably matters
   * (constitution §28: optimize based on measured bottlenecks, not
   * preemptively).
   */
  async submitUrls(
    project: ProjectRow,
    input: SubmitUrlsInput,
    actor: SubmissionActor,
  ): Promise<{ submissions: AcceptedSubmission[]; rejected: RejectedUrl[] }> {
    const projectId = project.id;
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

      // Deduct + upsert + create run in one transaction (docs/adr/0011): the
      // idempotency interceptor explicitly permits a client to retry this
      // exact request on any handler error, and a naive retry after
      // deduct-succeeds-but-create-fails would double-charge with no row to
      // show for it. If the deduction fails (insufficient balance), nothing
      // in this transaction wrote anything — it just commits empty.
      const result = await this.db.transaction(async (tx) => {
        const newBalance = await this.credits.deduct(
          project.userId,
          1,
          CreditLedgerReason.SUBMISSION_DEDUCTION,
          { normalizedUrl: normalized.normalizedUrl },
          tx,
        );
        if (newBalance === null) return null;

        const urlRow = await this.urlsRepo.upsert(
          {
            projectId,
            rawUrl,
            normalizedUrl: normalized.normalizedUrl,
            normalizedUrlHash: normalized.normalizedUrlHash,
            createdByUserId: actor.userId,
          },
          tx,
        );

        const submission = await this.submissions.create(
          {
            projectId,
            urlId: urlRow.id,
            userId: project.userId,
            provider: SubmissionProvider.INDEXNOW,
            requestedByUserId: actor.userId,
            requestedByApiKeyId: actor.apiKeyId,
          },
          tx,
        );

        return { urlRow, submission };
      });

      if (!result) {
        rejected.push({
          url: rawUrl,
          reason: SubmissionFailureReason.INSUFFICIENT_CREDITS,
          message: "Project owner's credit balance is insufficient",
        });
        continue;
      }

      const { urlRow, submission } = result;

      const payload: SubmissionJobPayload = {
        projectId,
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
        hostname: new URL(urlRow.normalizedUrl).hostname,
        state: UrlSubmissionState.QUEUED,
      });
    }

    if (accepted.length > 0) {
      await this.auditLog.record({
        userId: project.userId,
        actorUserId: actor.userId,
        actorApiKeyId: actor.apiKeyId,
        action: 'url.submitted',
        resourceType: 'project',
        resourceId: projectId,
        metadata: {
          acceptedCount: accepted.length,
          rejectedCount: rejected.length,
        },
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
