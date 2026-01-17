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