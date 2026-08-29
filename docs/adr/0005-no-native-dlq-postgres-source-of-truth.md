# 0005: No native BullMQ dead-letter queue — Postgres is the durable record

## Status

Accepted.

## Context

BullMQ has no built-in dead-letter-queue primitive; a job that exhausts all
retry attempts just becomes a "failed job" in Redis, retained according to
`removeOnFail` settings. Something durable needs to record *why* a
submission or verification ultimately failed, for both the user (a
dashboard showing failure reasons) and for future reprocessing tooling.

## Decision

Postgres is the durable source of truth, not a dedicated Redis DLQ queue.
When a job exhausts its attempts, the worker's `failed` handler writes the
terminal state directly to Postgres: `url_submissions.state = FAILED` (with
a structured `failure_reason`) or `domains.verification_status = FAILED`,
plus the full attempt history in `submission_attempts` /
`domain_verifications`. No `dead-letter` BullMQ queue is created.

## Consequences

- Postgres already has the query surface a DLQ would need — "show me
  everything that failed for organization X" is a normal SQL query against
  `url_submissions`, not a Redis-specific tool.
- A real reprocessing UI ("retry this failed submission") is explicitly
  Phase 2. Nothing today automatically requeues a `FAILED` row; a human
  would need to trigger that manually (there's no button for it yet).
  This is a genuine, acknowledged gap — not a hidden one.
- BullMQ's own failed-job retention in Redis still exists underneath this
  (whatever `removeOnFail` leaves behind), but it is not what anything in
  the product reads from. Redis retention is incidental operational
  detail; Postgres is the record that matters.
- If reprocessing tooling gets built later, it reads `FAILED` rows from
  Postgres and re-enqueues a fresh job — it does not need to touch
  BullMQ's own failed-job state at all.
