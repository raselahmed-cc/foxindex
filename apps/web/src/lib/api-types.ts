export type Role = 'client' | 'manager' | 'admin' | 'superadmin';

export interface NotificationChannels {
  inApp: boolean;
  email: boolean;
  whatsapp: boolean;
}

export type NotificationEvent = 'batchIndexed' | 'urlFailed' | 'lowBalance' | 'managerReplied' | 'paymentConfirmed' | 'weeklySummary';

export interface Preferences {
  notifications: Record<NotificationEvent, NotificationChannels>;
  lowBalanceThreshold: number;
  quietHours: '22:00-08:00' | 'none';
  submission: {
    google: boolean;
    indexnow: boolean;
    recheckUntilIndexed: boolean;
    priorityQueue: boolean;
    skipAlreadyIndexed: boolean;
    defaultSiteId: string | null;
    dailySpendLimit: number | null;
  };
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  dateOfBirth: string | null;
  phone: string | null;
  whatsapp: string | null;
  telegram: string | null;
  country: string | null;
  city: string | null;
  company: string | null;
  timezone: string | null;
  bio: string | null;
  createdAt: string;
  manager: { id: string; name: string; email: string; whatsapp: string | null } | null;
  preferences: Preferences;
  sites: { id: string; domain: string }[];
}

export interface CreditSummary {
  balance: number;
  usedAllTime: number;
  usedThisWeek: number;
  dailyBurn: number;
  refunded: number;
  daysLeft: number | null;
}

export type LedgerType = 'signup_bonus' | 'manual_add' | 'manual_deduct' | 'submission_deduct' | 'refund' | 'payment_credit';

export interface LedgerRow {
  id: string;
  amount: number;
  type: LedgerType;
  note: string | null;
  referenceId: string | null;
  performedById: string | null;
  performedByName: string | null;
  createdAt: string;
  balanceAfter: number;
}

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  priceBdt: string | null;
  priceUsd: string | null;
  isFeatured: boolean;
}

export interface PaymentMethod {
  id: string;
  type: string;
  label: string;
  network: string | null;
  isManual: boolean;
  gateway: string | null;
  feePercent: number;
  available: boolean;
  accountNumber: string | null;
  accountName: string | null;
  bankName: string | null;
  branch: string | null;
  instructions: string | null;
}

export interface Quote {
  credits: number;
  currency: 'BDT' | 'USD';
  packId: string | null;
  packName: string | null;
  rate: number;
  subtotal: number;
  feePercent: number;
  fee: number;
  total: number;
  nextTier: { credits: number; rate: number } | null;
}

export type PaymentStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'expired';

export interface Payment {
  id: string;
  reference: string;
  credits: number;
  amount: number;
  currency: string;
  status: PaymentStatus;
  methodLabel: string;
  transactionId: string | null;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface StaffPayment extends Payment {
  methodType: string;
  senderNumber: string | null;
  client: { id: string; name: string; email: string };
  needsAdmin: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  keyLast4: string;
  scopes: ('submit' | 'status' | 'sites')[];
  siteId: string | null;
  siteDomain: string | null;
  monthlyCreditCap: number | null;
  ipAllowlist: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  usage7d: number[];
  requests7d: number;
}

export interface Session {
  id: string;
  os: string;
  browser: string;
  mobile: boolean;
  ip: string | null;
  lastActiveAt: string;
  current: boolean;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'pending_email' | 'pending_approval' | 'active' | 'suspended';
  assignedManagerId: string | null;
  assignedManager: { id: string; name: string } | null;
  creditBalanceCached: number;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  city: string | null;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: Exclude<Role, 'client'>;
  status: string;
  maxClients: number | null;
  clients: number;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface Provider {
  id: string;
  kind: 'google_indexing' | 'indexnow' | 'external_api' | 'search_console_sitemap';
  label: string;
  priority: number;
  isActive: boolean;
  description: string | null;
  submitEndpoint: string | null;
  statusEndpoint: string | null;
  hasApiKey: boolean;
  dailyQuota: number | null;
  usedToday: number;
  costUsd: number;
  creditCost: number;
  requestTemplate: string | null;
  retriesOnly: boolean;
  autoPauseAfterErrors: boolean;
  submissions7d: number;
  successRate7d: number | null;
}

export interface ServiceAccount {
  id: string;
  label: string;
  clientEmail: string;
  gcpProjectId: string;
  dailyQuota: number;
  usedToday: number;
  errors24h: number;
  lastUsedAt: string | null;
  isActive: boolean;
  health: 'healthy' | 'near_quota' | 'errors' | 'paused';
}

export interface AuditEvent {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
}

export interface Overview {
  kpis: {
    revenueBdtMonth: number;
    revenueChange: number | null;
    paymentsMonth: number;
    urlsToday: number;
    indexedToday: number;
    activeClients: number;
    newClientsWeek: number;
    pendingApproval: number;
  };
  series: { day: string; urls: number; revenueBdt: number }[];
  managers: { id: string; name: string; status: string; clients: number; pendingPayments: number }[];
  attention: { kind: string; severity: 'bad' | 'warn' | 'info'; title: string; detail: string; href: string }[];
  recentAudit: AuditEvent[];
  health: { databaseMs: number; redisMs: number; aamarpayConfigured: boolean; smtpConfigured: boolean };
}

export interface AdminPack {
  id: string;
  name: string;
  credits: number;
  priceBdt: number;
  priceUsd: number;
  isActive: boolean | null;
  isFeatured: boolean;
  sold30d: number;
}

export interface AdminMethod {
  id: string;
  type: string;
  label: string;
  accountNumber: string | null;
  accountName: string | null;
  bankName: string | null;
  branch: string | null;
  network: string | null;
  instructions: string | null;
  isManual: boolean;
  gateway: string | null;
  isActive: boolean;
  sortOrder: number | null;
  feePercent: number;
}

export interface GatewayStatus {
  id: string;
  name: string;
  covers: string;
  configured: boolean;
  mode: 'sandbox' | 'live' | 'off';
  storeId: string | null;
  successRate: number | null;
  abandonedToday: number;
  lastSuccessAt: string | null;
}

export interface Conversation {
  id: string;
  createdAt: string;
  unread: number;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  internalNote?: string | null;
  managerId?: string;
  managerName?: string;
  peer: {
    id: string;
    name: string;
    whatsapp: string | null;
    since: string;
    email?: string;
    status?: string;
    credits?: number;
    availability?: 'available' | 'away';
  };
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  isImage: boolean;
}

export interface ChatMessageMeta {
  quickReplies?: string[];
  answered?: string;
  replyTo?: string;
  system?: 'ticket_created';
  ticketNumber?: string;
  ticketId?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  meta?: ChatMessageMeta | null;
  attachments?: Attachment[];
  /** Client-side only: optimistic copy waiting for (or failed to get) a server ack. */
  clientId?: string;
  pending?: boolean;
  failed?: string;
}
