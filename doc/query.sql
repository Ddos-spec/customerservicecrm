-- ==========================================
-- MIGRATION V2: CLEANUP SESSION COLUMNS
-- ==========================================
-- Menghapus kolom session pribadi di tabel users
-- Karena sekarang 1 Tenant = 1 Session WA (Single Session Architecture)

ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "user_session_id";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "tenant_session_id";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "session_id";
DROP INDEX IF EXISTS "users_session_id_idx";

-- Pastikan kolom session_id di tenants ada dan unique
ALTER TABLE "public"."tenants" ADD COLUMN IF NOT EXISTS "session_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_session_id_key" ON "public"."tenants" ("session_id");

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

-- ==========================================
-- MIGRATION V4: HYBRID PROVIDER (META CLOUD API)
-- ==========================================

-- 1. Tambah kolom Provider Config di tabel Tenants
ALTER TABLE "public"."tenants" ADD COLUMN IF NOT EXISTS "wa_provider" VARCHAR(20) DEFAULT 'whatsmeow';
ALTER TABLE "public"."tenants" ADD COLUMN IF NOT EXISTS "meta_phone_id" TEXT;
ALTER TABLE "public"."tenants" ADD COLUMN IF NOT EXISTS "meta_waba_id" TEXT;
ALTER TABLE "public"."tenants" ADD COLUMN IF NOT EXISTS "meta_token" TEXT; -- Simpan token (bisa dienkripsi di level aplikasi nanti)

-- Index untuk mempercepat lookup webhook Meta (jika nanti pakai phone_id sebagai identifier)
CREATE INDEX IF NOT EXISTS "idx_tenants_meta_phone_id" ON "public"."tenants" ("meta_phone_id");
