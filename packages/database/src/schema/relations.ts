import { relations } from 'drizzle-orm';
import { apiKeys } from './api-keys';
import { auditLogs } from './audit-logs';
import { chatConversations, chatMessages } from './chat';
import { creditTransactions } from './credits';
import { googleServiceAccounts, indexChecks, indexingProviders, submissionBatches, urlSubmissions, urls } from './indexing';
import { notifications } from './notifications';
import { paymentMethods, payments, userPaymentAccounts } from './payments';
import { siteSearchConsoleConnections, sites } from './sites';
import { ticketMacros, ticketMessages, tickets } from './tickets';
import { emailVerificationCodes, sessions, users } from './users';

export const usersRelations = relations(users, ({ one, many }) => ({
  assignedManager: one(users, { fields: [users.assignedManagerId], references: [users.id] }),
  sessions: many(sessions),
  emailVerificationCodes: many(emailVerificationCodes),
  sites: many(sites),
  urls: many(urls),
  urlSubmissions: many(urlSubmissions),
  apiKeys: many(apiKeys),
  creditTransactions: many(creditTransactions),
  payments: many(payments),
  tickets: many(tickets),
  assignedTickets: many(tickets),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const emailVerificationCodesRelations = relations(emailVerificationCodes, ({ one }) => ({
  user: one(users, { fields: [emailVerificationCodes.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(users, { fields: [creditTransactions.userId], references: [users.id] }),
  performedByUser: one(users, { fields: [creditTransactions.performedBy], references: [users.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  method: one(paymentMethods, { fields: [payments.methodId], references: [paymentMethods.id] }),
  reviewedByUser: one(users, { fields: [payments.reviewedBy], references: [users.id] }),
}));

export const userPaymentAccountsRelations = relations(userPaymentAccounts, ({ one }) => ({
  user: one(users, { fields: [userPaymentAccounts.userId], references: [users.id] }),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
  user: one(users, { fields: [sites.userId], references: [users.id] }),
  searchConsoleConnection: one(siteSearchConsoleConnections, {
    fields: [sites.id],
    references: [siteSearchConsoleConnections.siteId],
  }),
  urls: many(urls),
}));

export const urlsRelations = relations(urls, ({ one, many }) => ({
  site: one(sites, { fields: [urls.siteId], references: [sites.id] }),
  user: one(users, { fields: [urls.userId], references: [users.id] }),
  submissions: many(urlSubmissions),
  indexChecks: many(indexChecks),
}));

export const urlSubmissionsRelations = relations(urlSubmissions, ({ one }) => ({
  url: one(urls, { fields: [urlSubmissions.urlId], references: [urls.id] }),
  user: one(users, { fields: [urlSubmissions.userId], references: [users.id] }),
  provider: one(indexingProviders, { fields: [urlSubmissions.providerId], references: [indexingProviders.id] }),
  batch: one(submissionBatches, { fields: [urlSubmissions.batchId], references: [submissionBatches.id] }),
}));

export const submissionBatchesRelations = relations(submissionBatches, ({ one, many }) => ({
  user: one(users, { fields: [submissionBatches.userId], references: [users.id] }),
  site: one(sites, { fields: [submissionBatches.siteId], references: [sites.id] }),
  submissions: many(urlSubmissions),
}));

export const indexChecksRelations = relations(indexChecks, ({ one }) => ({
  url: one(urls, { fields: [indexChecks.urlId], references: [urls.id] }),
  provider: one(indexingProviders, { fields: [indexChecks.providerId], references: [indexingProviders.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
  site: one(sites, { fields: [apiKeys.siteId], references: [sites.id] }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  user: one(users, { fields: [tickets.userId], references: [users.id] }),
  assignedManager: one(users, { fields: [tickets.assignedManagerId], references: [users.id] }),
  site: one(sites, { fields: [tickets.siteId], references: [sites.id] }),
  messages: many(ticketMessages),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketMessages.ticketId], references: [tickets.id] }),
  sender: one(users, { fields: [ticketMessages.senderId], references: [users.id] }),
}));

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  client: one(users, { fields: [chatConversations.clientId], references: [users.id] }),
  manager: one(users, { fields: [chatConversations.managerId], references: [users.id] }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, { fields: [chatMessages.conversationId], references: [chatConversations.id] }),
  sender: one(users, { fields: [chatMessages.senderId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const googleServiceAccountsRelations = relations(googleServiceAccounts, () => ({}));

export const ticketMacrosRelations = relations(ticketMacros, ({ one }) => ({
  owner: one(users, { fields: [ticketMacros.ownerId], references: [users.id] }),
}));
