# Terraform (Phase 2+)

Not implemented in Phase 1. Infrastructure is provisioned manually (Neon project,
Upstash database, a Docker host running `docker-compose.dev.yml` or its staging
equivalent) — reproducible, declarative infrastructure-as-code is deferred until
there's a second environment to keep in sync with the first, per constitution §27's
eventual requirement: "reproducible infrastructure" for multiple API/worker replicas,
load balancing, managed Postgres/Redis, S3, Cloudflare, and monitoring.

When this is built, it should describe — not replace — the same architecture already
running: Neon (Postgres), Upstash (Redis), object storage, Cloudflare DNS/proxy
records, and the compute running the Docker images `infrastructure/docker/`
already builds. No application code should need to change for a Terraform migration.
