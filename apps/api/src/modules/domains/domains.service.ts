import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { generateIndexNowKey, indexNowKeyFileUrl } from '@foxindex/providers';
import { DomainVerificationStatus, type VerificationJobPayload } from '@foxindex/types';
import { enqueueVerificationJob } from '@foxindex/queue';
import type { CreateDomainInput } from '@foxindex/validation';
import { NotFoundError } from '../../common/errors/app-error';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { VERIFICATION_QUEUE } from '../../queues/verification-queue.provider';
import { DomainsRepository } from './domains.repository';

@Injectable()
export class DomainsService {
  // Every param is explicitly @Inject()'d, not just VERIFICATION_QUEUE — found
  // via live boot testing that tsx/esbuild's decorator-metadata elision (used
  // by `pnpm dev`) leaves an implicit-type param undefined at runtime when the
  // constructor mixes implicit-type params with an explicit @Inject() one.
  // tsc (the real build) handles it correctly, but relying on that gap between
  // dev and prod tooling isn't worth it — explicit @Inject() everywhere in a
  // mixed constructor sidesteps the ambiguity entirely.
  constructor(
    @Inject(DomainsRepository) private readonly repository: DomainsRepository,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(VERIFICATION_QUEUE) private readonly verificationQueue: Queue<VerificationJobPayload>,
  ) {}

  async create(organizationId: string, projectId: string, input: CreateDomainInput, userId: string) {
    const indexnowKey = generateIndexNowKey();
    const domain = await this.repository.create({
      organizationId,
      projectId,
      hostname: input.hostname,
      indexnowKey,
      createdByUserId: userId,
    });

    await this.auditLog.record({
      organizationId,
      actorUserId: userId,
      action: 'domain.created',
      resourceType: 'domain',
      resourceId: domain.id,
      metadata: { hostname: domain.hostname },
    });

    return { ...domain, keyFileUrl: indexNowKeyFileUrl(domain.hostname, domain.indexnowKey) };
  }

  /**
   * Submitting a URL no longer requires pre-registering its domain
   * (docs/adr/0012): this resolves an existing domain by hostname, or
   * silently creates one (a fresh, unverified IndexNow key) the first time
   * that hostname is ever submitted. `created` distinguishes the two only
   * for audit logging — the caller otherwise treats both the same way.
   */
  async findOrCreateByHostname(organizationId: string, projectId: string, hostname: string, userId?: string) {
    const indexnowKey = generateIndexNowKey();
    const { domain, created } = await this.repository.findOrCreate({
      organizationId,
      projectId,
      hostname,
      indexnowKey,
      createdByUserId: userId,
    });

    if (created) {
      await this.auditLog.record({
        organizationId,
        actorUserId: userId,
        action: 'domain.created',
        resourceType: 'domain',
        resourceId: domain.id,
        metadata: { hostname: domain.hostname, autoCreatedOnSubmit: true },
      });
    }

    return { ...domain, keyFileUrl: indexNowKeyFileUrl(domain.hostname, domain.indexnowKey) };
  }

  findAllForProject(projectId: string) {
    return this.repository.findAllForProject(projectId);
  }

  async findOne(projectId: string, domainId: string) {
    const domain = await this.repository.findByIdForProject(projectId, domainId);
    if (!domain) throw new NotFoundError('Domain');
    return { ...domain, keyFileUrl: indexNowKeyFileUrl(domain.hostname, domain.indexnowKey) };
  }

  /**
   * Short-circuits with enqueued:false if the domain is already VERIFIED and
   * the caller didn't ask for a recheck — avoids needlessly re-queuing work for
   * the common "verify once, never again" path while still allowing an
   * explicit recheck later (a key file could disappear after verification).
   */
  async requestVerification(
    organizationId: string,
    projectId: string,
    domainId: string,
    recheck: boolean,
  ): Promise<{ enqueued: boolean }> {
    const domain = await this.repository.findByIdForProject(projectId, domainId);
    if (!domain) throw new NotFoundError('Domain');

    if (domain.verificationStatus === DomainVerificationStatus.VERIFIED && !recheck) {
      return { enqueued: false };
    }

    const payload: VerificationJobPayload = {
      organizationId,
      projectId,
      domainId,
      jobType: 'DOMAIN_VERIFICATION',
      attempt: 1,
      requestedAt: new Date().toISOString(),
    };
    await enqueueVerificationJob(this.verificationQueue, payload);
    return { enqueued: true };
  }

  async findVerifications(projectId: string, domainId: string) {
    const domain = await this.repository.findByIdForProject(projectId, domainId);
    if (!domain) throw new NotFoundError('Domain');
    return this.repository.findVerificationsForDomain(domainId);
  }
}
