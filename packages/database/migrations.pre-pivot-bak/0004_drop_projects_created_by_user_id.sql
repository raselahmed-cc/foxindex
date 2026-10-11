-- Custom SQL migration file, put your code below! --

-- projects.created_by_user_id is redundant now (docs/adr/0013): a project
-- has exactly one owner (user_id), so "who created it" and "who owns it"
-- are the same person — this column was dropped from schema.ts during the
-- flatten but missed from migration 0003's column-drop list.
ALTER TABLE "projects" DROP COLUMN IF EXISTS "created_by_user_id";
