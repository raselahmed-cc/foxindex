-- Index checks are new: give URLs submitted in the last 30 days a first check soon,
-- spread over the next hour so Google's per-minute quota isn't hit all at once.
UPDATE "urls" u
SET "next_index_check_at" = now() + (random() * interval '60 minutes')
WHERE u."indexed_at" IS NULL
  AND u."next_index_check_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "url_submissions" s
    WHERE s."url_id" = u."id" AND s."status" IN ('submitted', 'not_indexed') AND s."created_at" >= now() - interval '30 days'
  );
