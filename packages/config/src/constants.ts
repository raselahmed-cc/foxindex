/**
 * The shared multi-engine IndexNow submission endpoint — a single POST here propagates
 * to every participating search engine (Bing, Yandex, Naver, Seznam, Yep). Configurable
 * via INDEXNOW_API_BASE_URL so tests/E2E can point it at a local mock.
 */
export const DEFAULT_INDEXNOW_API_BASE_URL = 'https://api.indexnow.org/indexnow';

/** IndexNow protocol key constraints (indexnow.org/documentation). */
export const INDEXNOW_KEY_MIN_LENGTH = 8;
export const INDEXNOW_KEY_MAX_LENGTH = 128;
/** FoxIndex always generates 32-char hex keys — well inside the protocol's bounds. */
export const INDEXNOW_GENERATED_KEY_LENGTH = 32;

export const SERVICE_NAMES = {
  API: 'foxindex-api',
  WEB: 'foxindex-web',
  SUBMISSION_WORKER: 'foxindex-worker-submission',
  VERIFICATION_WORKER: 'foxindex-worker-verification',
} as const;

// Lowered from 100, not raised — measured live against real Neon (docs/adr/0011)
// during the credits change: each URL now costs ~4 sequential DB round trips
// (was ~2 before credits), and a request's wall-clock time works out to
// roughly a ~12s fixed cost plus ~4s per URL. 100 URLs would be ~7 minutes;
// 20 measured at ~93s end to end. True bulk (thousands, async, batched SQL)
// is deferred, not built here — see the ADR.
export const MAX_URLS_PER_SUBMISSION_REQUEST = 20;

/** New organizations start with this many credits (docs/adr/0011). */
export const STARTER_CREDIT_BALANCE = 50;
