import { relations } from 'drizzle-orm';
import { user } from './auth';
import { apiKeys } from './api-keys';
import { auditLogs } from './audit-logs';
import { creditLedger } from './credits';
import { domains, domainVerifications } from './domains';
import { organizationMembers, organizations } from './organizations';
import { projects } from './projects';
import { submissionAttempts, urlSubmissions } from './submissions';
import { urls } from './urls';

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  projects: many(projects),
  apiKeys: many(apiKeys),
  auditLogs: many(auditLogs),
  creditLedger: many(creditLedger),
}));

export const creditLedgerRelations = relations(creditLedger, ({ one }) => ({
  organization: one(organizations, { fields: [creditLedger.organizationId], references: [organizations.id] }),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(user, { fields: [organizationMembers.userId], references: [user.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, { fields: [projects.organizationId], references: [organizations.id] }),
  domains: many(domains),
  urls: many(urls),
  urlSubmissions: many(urlSubmissions),
  apiKeys: many(apiKeys),
}));

export const domainsRelations = relations(domains, ({ one, many }) => ({
  organization: one(organizations, { fields: [domains.organizationId], references: [organizations.id] }),
  project: one(projects, { fields: [domains.projectId], references: [projects.id] }),
  urls: many(urls),
  verifications: many(domainVerifications),
}));

export const domainVerificationsRelations = relations(domainVerifications, ({ one }) => ({
  domain: one(domains, { fields: [domainVerifications.domainId], references: [domains.id] }),
}));

export const urlsRelations = relations(urls, ({ one, many }) => ({
  organization: one(organizations, { fields: [urls.organizationId], references: [organizations.id] }),
  project: one(projects, { fields: [urls.projectId], references: [projects.id] }),
  domain: one(domains, { fields: [urls.domainId], references: [domains.id] }),
  submissions: many(urlSubmissions),
}));

export const urlSubmissionsRelations = relations(urlSubmissions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [urlSubmissions.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [urlSubmissions.projectId], references: [projects.id] }),
  url: one(urls, { fields: [urlSubmissions.urlId], references: [urls.id] }),
  attempts: many(submissionAttempts),
  requestedByApiKey: one(apiKeys, {
    fields: [urlSubmissions.requestedByApiKeyId],
    references: [apiKeys.id],
  }),
}));

export const submissionAttemptsRelations = relations(submissionAttempts, ({ one }) => ({
  urlSubmission: one(urlSubmissions, {
    fields: [submissionAttempts.urlSubmissionId],
    references: [urlSubmissions.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  organization: one(organizations, { fields: [apiKeys.organizationId], references: [organizations.id] }),
  project: one(projects, { fields: [apiKeys.projectId], references: [projects.id] }),
  submissions: many(urlSubmissions),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, { fields: [auditLogs.organizationId], references: [organizations.id] }),
}));
