-- Managers were capped at 5,000 credits per adjustment and 20,000 per day by the first
-- credit policy defaults, which blocked normal manual top-ups. Move a saved policy that
-- still has those exact defaults to the new ones (100,000 per adjustment, no daily cap).
-- Values a superadmin chose deliberately are left alone.
UPDATE "app_settings"
SET "value" = jsonb_set("value"::jsonb, '{managerMaxPerAdjustment}', '100000'::jsonb),
    "updated_at" = now()
WHERE "key" = 'credits' AND ("value"::jsonb ->> 'managerMaxPerAdjustment') = '5000';
--> statement-breakpoint
UPDATE "app_settings"
SET "value" = jsonb_set("value"::jsonb, '{managerDailyLimit}', '0'::jsonb),
    "updated_at" = now()
WHERE "key" = 'credits' AND ("value"::jsonb ->> 'managerDailyLimit') = '20000';
