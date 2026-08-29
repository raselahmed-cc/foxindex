# Sitemap worker (Phase 2+)

Not implemented — this is a stub directory, not a pnpm workspace package.

Intended scope: parses an uploaded/discovered sitemap.xml into individual URLs for
bulk submission (constitution's "Sitemap management" capability, and §11's
large-import streaming/batching requirements — never loading a large sitemap
entirely into memory). Would write to the deferred `sitemaps`/`sitemap_urls` tables
(see `docs/future-schema.md`) and hand accepted URLs to the existing submission
queue rather than reimplementing submission logic.
