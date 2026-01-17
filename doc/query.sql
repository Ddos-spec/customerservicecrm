-- ==========================================
-- MIGRATION V3: TENANT API KEY & IMPERSONATE
-- ==========================================

-- 1. Tambah API Key untuk Tenant (Auto generate untuk tenant baru)
ALTER TABLE "public"."tenants" ADD COLUMN IF NOT EXISTS "api_key" TEXT UNIQUE;

-- Generate API Key untuk tenant lama yang belum punya
UPDATE "public"."tenants" 
SET "api_key" = 'sk_' || encode(gen_random_bytes(24), 'hex') 
WHERE "api_key" IS NULL;

-- 2. Tambah Log Error sederhana untuk Invite
ALTER TABLE "public"."user_invites" ADD COLUMN IF NOT EXISTS "last_error" TEXT;
