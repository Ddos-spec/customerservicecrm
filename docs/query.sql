
-- ==========================================
-- MIGRATION V5: SECURITY HARDENING
-- ==========================================

-- 1. Unique Constraint untuk Meta Phone ID (Routing Safety)
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_meta_phone_id_key" ON "public"."tenants" ("meta_phone_id");

-- 2. Unique Constraint untuk Message ID (Idempotency Atomic)
-- Note: Pastikan duplikat sudah dibersihkan sebelum menjalankan ini
CREATE UNIQUE INDEX IF NOT EXISTS "messages_wa_message_id_key" ON "public"."messages" ("wa_message_id");

-- ==========================================
-- MIGRATION V6: MARKETING MODULE (WA BLAST)
-- ==========================================

-- 1. Tabel Group Kontak (Tagging)
CREATE TABLE IF NOT EXISTS "public"."contact_groups" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL REFERENCES "public"."tenants" ("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE("tenant_id", "name")
);

-- 2. Relasi Kontak <-> Group (Many to Many)
CREATE TABLE IF NOT EXISTS "public"."contact_group_members" (
    "contact_id" UUID NOT NULL REFERENCES "public"."contacts" ("id") ON DELETE CASCADE,
    "group_id" UUID NOT NULL REFERENCES "public"."contact_groups" ("id") ON DELETE CASCADE,
    "joined_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY ("contact_id", "group_id")
);

-- 3. Tabel Kampanye (Campaign Header)
CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL REFERENCES "public"."tenants" ("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "message_template" TEXT NOT NULL,
    "status" VARCHAR(20) DEFAULT 'draft', -- draft, scheduled, processing, completed, paused, failed
    "scheduled_at" TIMESTAMP WITH TIME ZONE, -- Jika null, kirim sekarang (immediate)
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "completed_at" TIMESTAMP WITH TIME ZONE,
    "total_targets" INT DEFAULT 0,
    "success_count" INT DEFAULT 0,
    "failed_count" INT DEFAULT 0
);

-- 4. Tabel Log Pengiriman (Campaign Queue)
CREATE TABLE IF NOT EXISTS "public"."campaign_messages" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL REFERENCES "public"."campaigns" ("id") ON DELETE CASCADE,
    "contact_id" UUID NOT NULL REFERENCES "public"."contacts" ("id") ON DELETE CASCADE,
    "phone_number" TEXT NOT NULL, -- Snapshot nomor saat blast (jaga-jaga kontak dihapus/ubah)
    "status" VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
    "error_message" TEXT,
    "sent_at" TIMESTAMP WITH TIME ZONE,
    "wa_message_id" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index untuk mempercepat query antrian
CREATE INDEX IF NOT EXISTS "idx_campaign_queue" ON "public"."campaign_messages" ("campaign_id", "status");

-- ==========================================
-- MIGRATION V7: ANALYTICS & CATEGORIZATION
-- ==========================================

-- 1. Add Business Category to Tenants
ALTER TABLE "public"."tenants" ADD COLUMN IF NOT EXISTS "business_category" VARCHAR(50) DEFAULT 'general';

