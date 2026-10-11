# Deploying FoxIndex

A single Linux server (VPS) runs the whole platform with Docker Compose:
Caddy (HTTPS) → web (Next.js) + API (NestJS) + submission worker, with
Postgres and Redis. Everything is in `infrastructure/docker/`.

> The images have not yet been built on real Docker in this repo's history
> (the development machine has no Docker). The application has been verified
> in production mode outside containers — compiled API with production env
> validation, the Next.js standalone server, and the worker. Run the first
> deploy on a staging server before pointing customers at it.

## 1. Server

- Ubuntu 22.04+ (or any Linux with Docker Engine 24+ and the Compose plugin), 2 vCPU / 4 GB RAM minimum.
- Ports 80 and 443 open. A DNS `A` (and `AAAA`) record for your app domain pointing at the server.
- Clone the repo onto the server (or copy a release tarball).

## 2. Configure

```bash
cd infrastructure/docker
cp .env.production.example .env.production
chmod 600 .env.production
```

Fill in every value. Generate secrets with `openssl rand -base64 48`:

| Variable | Notes |
|---|---|
| `DOMAIN`, `ACME_EMAIL` | App domain and the email Let's Encrypt uses. |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | Random. `DATABASE_URL` / `REDIS_URL` reference them. |
| `JWT_SECRET` | ≥ 32 random characters. Rotating it signs everyone out. |
| `ENCRYPTION_KEY` | ≥ 32 random characters, different from `JWT_SECRET`. **Back it up** — it decrypts stored Google service-account keys. Losing it means re-adding them. |
| `SMTP_*` | A real SMTP relay (verification codes and notifications depend on it). |
| `AAMARPAY_*` | Optional card payments. Leave the IDs empty to hide card checkout. |
| `SEED_SUPERADMIN_EMAIL`, `SEED_PASSWORD` | First superadmin (≥ 12 character password). Used once. |

The API refuses to start in production with weak or placeholder secrets, a
non-https `CORS_ORIGIN`, or missing settings, and prints exactly what is wrong.

## 3. First deploy

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production --profile seed run --rm seed
```

`up` runs database migrations first (the one-shot `migrate` service); the API
and worker only start after migrations succeed. Check:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps     # all healthy
curl https://$DOMAIN/api/v1/health/ready                                    # {"status":"ok","database":true,"redis":true}
```

Then sign in as the superadmin and:

1. **Indexing providers → Google**: add at least one Google Cloud service account (JSON key) with the
   Web Search Indexing API enabled. Until one exists, clients can only submit to the free IndexNow engines.
2. **Payment methods / credit packs**: review the seeded defaults.
3. **Staff & roles**: invite managers.
4. **Tickets → SLA & automation**: set business hours, holidays and SLA targets.

Clients add the service-account email as an **Owner** of their site in Google Search Console
(the Sites page shows the address and steps). Google rejects submissions otherwise; those
credits are refunded automatically.

## 4. Updating

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Migrations run automatically before the new API starts. The API and worker
shut down gracefully on SIGTERM (in-flight jobs finish; unfinished batches are
re-picked by the worker's 5-minute sweeper).

## 5. Operations

- **Backups**: `docker compose exec postgres pg_dump -U foxindex foxindex | gzip > backup-$(date +%F).sql.gz` —
  schedule it daily and copy off the server. Also back up the `uploads` volume (ticket/chat attachments)
  and `.env.production`.
- **Logs**: JSON to stdout, rotated by Docker (20 MB × 5 per service). `docker compose logs -f api worker-submission`.
- **Health**: `/api/v1/health` (liveness) and `/api/v1/health/ready` (database + Redis). Containers have
  health checks; the worker writes a heartbeat file every 15 s.
- **Scaling**: the worker scales horizontally (`--scale worker-submission=3`). The API can scale too once
  attachments move to shared storage (the `uploads` volume is per-server). socket.io already uses the Redis
  adapter, so realtime works across API replicas.
- **Managed Postgres/Redis**: point `DATABASE_URL`/`REDIS_URL` at them, set `DATABASE_SSL=true`, and remove
  the `postgres`/`redis` services. Redis **must** use `maxmemory-policy noeviction` (BullMQ requirement).
- **API docs**: Swagger is off in production; set `API_DOCS_ENABLED=true` to expose `/api/docs`.

## What runs where

| Service | Purpose |
|---|---|
| `caddy` | TLS (Let's Encrypt), routes `/api/*` and `/socket.io/*` to the API, everything else to web |
| `web` | Next.js standalone server |
| `api` | REST API, public API (`/api/v1/urls`, `/sites`), websockets, ticket SLA automation (BullMQ scheduler) |
| `worker-submission` | Sends batches to Google Indexing API and IndexNow, refunds failed Google submissions, re-enqueues stuck batches |
| `migrate` / `seed` | One-shot jobs |
| `postgres`, `redis` | Data (volumes `postgres-data`, `redis-data`) |

## Known limits

- URL index status is "submitted/accepted", not "indexed": confirming Google indexation needs Search Console
  URL Inspection per client property (not built yet).
- WhatsApp notifications need a provider account (Meta Cloud API / Twilio); email and in-app work.
- Password reset by email is not built yet.
