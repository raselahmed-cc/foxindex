-- Account managers may now remove credits from their own clients (with a reason,
-- never below zero, audited). Turn it on in a saved credit policy too.
UPDATE "app_settings"
SET "value" = jsonb_set("value"::jsonb, '{managersCanDeduct}', 'true'::jsonb),
    "updated_at" = now()
WHERE "key" = 'credits';
