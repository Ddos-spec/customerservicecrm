
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

-- 2. Add AI Mode to Tenants
ALTER TABLE "public"."tenants" ADD COLUMN IF NOT EXISTS "ai_mode" VARCHAR(20) DEFAULT 'agent';
UPDATE "public"."tenants"
SET "ai_mode" = 'agent'
WHERE "ai_mode" IS NULL OR trim("ai_mode") = '';

-- ==========================================
-- MIGRATION V8: AI AGENT (RAG) — REPLACES CHATBOT EXACT-MATCH
-- ==========================================

-- 1. Config AI per tenant (system prompt, model, API key milik tenant sendiri)
CREATE TABLE IF NOT EXISTS "public"."tenant_ai_config" (
    "tenant_id" UUID PRIMARY KEY REFERENCES "public"."tenants" ("id") ON DELETE CASCADE,
    "system_prompt" TEXT NOT NULL DEFAULT '',
    "openrouter_api_key" TEXT NULL,
    "chat_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "embedding_model" TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small',
    "temperature" NUMERIC(3,2) NOT NULL DEFAULT 0.3,
    "max_tokens" INTEGER NOT NULL DEFAULT 500,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Dokumen sumber knowledge base (upload file / URL / FAQ manual) — metadata level
CREATE TABLE IF NOT EXISTS "public"."knowledge_documents" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL REFERENCES "public"."tenants" ("id") ON DELETE CASCADE,
    "source_type" VARCHAR(20) NOT NULL, -- 'file' | 'url' | 'faq'
    "title" TEXT NOT NULL,
    "original_filename" TEXT NULL,
    "file_path" TEXT NULL,
    "source_url" TEXT NULL,
    "raw_text" TEXT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | processing | ready | failed
    "error_message" TEXT NULL,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NULL REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_knowledge_documents_tenant" ON "public"."knowledge_documents" ("tenant_id", "status");

-- 3. Chunk + embedding (application-layer cosine similarity, no pgvector)
CREATE TABLE IF NOT EXISTS "public"."knowledge_chunks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL REFERENCES "public"."tenants" ("id") ON DELETE CASCADE,
    "document_id" UUID NOT NULL REFERENCES "public"."knowledge_documents" ("id") ON DELETE CASCADE,
    "chunk_index" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[] NOT NULL,
    "embedding_dim" INTEGER NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_tenant" ON "public"."knowledge_chunks" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_document" ON "public"."knowledge_chunks" ("document_id");

-- 4. Escalation log (audit trail ringan — chats.status saja tidak menyimpan alasan eskalasi)
CREATE TABLE IF NOT EXISTS "public"."escalation_log" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL REFERENCES "public"."tenants" ("id") ON DELETE CASCADE,
    "chat_id" UUID NOT NULL REFERENCES "public"."chats" ("id") ON DELETE CASCADE,
    "trigger_type" VARCHAR(30) NOT NULL, -- 'keyword' | 'sensitive_topic' | 'no_context' | 'llm_uncertain'
    "trigger_detail" TEXT NULL,
    "message_id" UUID NULL REFERENCES "public"."messages" ("id") ON DELETE SET NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_escalation_log_tenant" ON "public"."escalation_log" ("tenant_id", "created_at");

