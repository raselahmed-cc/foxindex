/**
 * Per-engine IndexNow endpoints. NOT called by IndexNowProvider today — a single
 * POST to the shared api.indexnow.org endpoint already propagates to every
 * participating engine, so calling these individually would just be 5x the HTTP
 * calls for the same effect. Kept here as the documented Phase 2 fallback if
 * per-engine resilience (retry engine B if engine A's endpoint is down) is ever
 * needed.
 */
export const INDEXNOW_PER_ENGINE_ENDPOINTS = {
  bing: 'https://www.bing.com/indexnow',
  yandex: 'https://yandex.com/indexnow',
  seznam: 'https://search.seznam.cz/indexnow',
  naver: 'https://searchadvisor.naver.com/indexnow',
  yep: 'https://indexnow.yep.com/indexnow',
} as const;
