-- =============================================
-- CUSTOMER SERVICE CRM DATABASE SCHEMA (CLEAN & MATURE)
-- =============================================

-- 1. CORE CRM TABLES
-- ------------------

CREATE TABLE "public"."tenants" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_name" TEXT NOT NULL,
  "status" VARCHAR(20) NULL DEFAULT 'active',
  "session_id" TEXT NULL,
  "max_active_members" INTEGER NULL DEFAULT 100,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenants_session_id_key" UNIQUE ("session_id")
);

CREATE TABLE "public"."users" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NULL DEFAULT 'active',
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  "phone_number" TEXT NULL,
  "session_id" TEXT NULL,
  "user_session_id" TEXT NULL,
  "tenant_session_id" TEXT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email"),
  CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE
);

CREATE TABLE "public"."contacts" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "jid" TEXT NOT NULL,
  "phone_number" TEXT NULL,
  "full_name" TEXT NULL,
  "profile_pic_url" TEXT NULL,
  "is_business" BOOLEAN NULL DEFAULT false,
  "about_status" TEXT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contacts_tenant_id_jid_key" UNIQUE ("tenant_id", "jid"),
  CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE
);

CREATE TABLE "public"."chats" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "assigned_to" UUID NULL,
  "status" VARCHAR(20) NULL DEFAULT 'open',
  "is_group" BOOLEAN NOT NULL DEFAULT false,
  "unread_count" INTEGER NULL DEFAULT 0,
  "last_message_preview" TEXT NULL,
  "last_message_time" TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  "last_message_type" VARCHAR(20) NULL DEFAULT 'text',
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  CONSTRAINT "chats_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chats_tenant_id_contact_id_key" UNIQUE ("tenant_id", "contact_id"),
  CONSTRAINT "chats_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE,
  CONSTRAINT "chats_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users" ("id") ON DELETE SET NULL
);

CREATE TABLE "public"."messages" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "chat_id" UUID NOT NULL,
  "sender_type" VARCHAR(20) NOT NULL,
  "sender_id" TEXT NULL,
  "sender_name" TEXT NULL,
  "message_type" VARCHAR(20) NULL DEFAULT 'text',
  "body" TEXT NULL,
  "media_url" TEXT NULL,
  "wa_message_id" TEXT NULL,
  "is_from_me" BOOLEAN NULL DEFAULT false,
  "status" VARCHAR(20) NULL DEFAULT 'sent',
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE CASCADE
);

CREATE TABLE "public"."message_attachments" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" BIGINT NULL,
  "duration_ms" INTEGER NULL,
  "storage_provider" TEXT NOT NULL DEFAULT 's3',
  "storage_key" TEXT NOT NULL,
  "thumbnail_key" TEXT NULL,
  "sha256" TEXT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."audit_logs" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NULL,
  "actor_user_id" UUID NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT NULL,
  "target_id" UUID NULL,
  "ip" TEXT NULL,
  "user_agent" TEXT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."outlet_channels" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "outlet_id" INTEGER NOT NULL,
  "channel" VARCHAR(50) NULL DEFAULT 'whatsapp',
  "channel_identifier" VARCHAR(255) NULL,
  "created_at" TIMESTAMP NULL DEFAULT now(),
  CONSTRAINT "outlet_channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."system_settings" ( 
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "public"."tenant_webhooks" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  CONSTRAINT "tenant_webhooks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_webhooks_tenant_id_url_key" UNIQUE ("tenant_id", "url"),
  CONSTRAINT "tenant_webhooks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE
);

CREATE TABLE "public"."user_invites" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" VARCHAR(20) NOT NULL DEFAULT 'agent',
  "token" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "created_by" UUID NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  "expires_at" TIMESTAMP WITH TIME ZONE NULL,
  "phone_number" TEXT NULL,
  CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_invites_token_key" UNIQUE ("token"),
  CONSTRAINT "user_invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE,
  CONSTRAINT "user_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL
);

-- 2. INDEXES
-- ----------

CREATE INDEX "idx_audit_actor_time" ON "public"."audit_logs" ("actor_user_id" ASC, "created_at" DESC);
CREATE INDEX "idx_audit_tenant_time" ON "public"."audit_logs" ("tenant_id" ASC, "created_at" DESC);
CREATE INDEX "idx_chats_tenant_updated" ON "public"."chats" ("tenant_id" ASC, "updated_at" DESC);
CREATE INDEX "idx_contacts_tenant_jid" ON "public"."contacts" ("tenant_id" ASC, "jid" ASC);
CREATE INDEX "idx_attachments_message" ON "public"."message_attachments" ("message_id" ASC);
CREATE INDEX "idx_messages_wa_id" ON "public"."messages" ("wa_message_id" ASC);
CREATE INDEX "idx_messages_chat_time" ON "public"."messages" ("chat_id" ASC, "created_at" ASC);
CREATE INDEX "idx_outlet_channels_outlet_id" ON "public"."outlet_channels" ("outlet_id" ASC);
CREATE INDEX "tenant_webhooks_tenant_id_idx" ON "public"."tenant_webhooks" ("tenant_id" ASC);
CREATE INDEX "user_invites_email_idx" ON "public"."user_invites" ("email" ASC);
CREATE INDEX "idx_users_tenant_role_status" ON "public"."users" ("tenant_id" ASC, "role" ASC, "status" ASC);


-- 3. WHATSMEOW TABLES (RAW GATEWAY)
-- ---------------------------------

CREATE TABLE "public"."whatsmeow_app_state_mutation_macs" ( 
  "jid" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" BIGINT NOT NULL,
  "index_mac" BYTEA NOT NULL,
  "value_mac" BYTEA NOT NULL,
  CONSTRAINT "whatsmeow_app_state_mutation_macs_pkey" PRIMARY KEY ("jid", "name", "version", "index_mac")
);
CREATE TABLE "public"."whatsmeow_app_state_sync_keys" ( 
  "jid" TEXT NOT NULL,
  "key_id" BYTEA NOT NULL,
  "key_data" BYTEA NOT NULL,
  "timestamp" BIGINT NOT NULL,
  "fingerprint" BYTEA NOT NULL,
  CONSTRAINT "whatsmeow_app_state_sync_keys_pkey" PRIMARY KEY ("jid", "key_id")
);
CREATE TABLE "public"."whatsmeow_app_state_version" ( 
  "jid" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" BIGINT NOT NULL,
  "hash" BYTEA NOT NULL,
  CONSTRAINT "whatsmeow_app_state_version_pkey" PRIMARY KEY ("jid", "name")
);
CREATE TABLE "public"."whatsmeow_chat_settings" ( 
  "our_jid" TEXT NOT NULL,
  "chat_jid" TEXT NOT NULL,
  "muted_until" BIGINT NOT NULL DEFAULT 0 ,
  "pinned" BOOLEAN NOT NULL DEFAULT false ,
  "archived" BOOLEAN NOT NULL DEFAULT false ,
  CONSTRAINT "whatsmeow_chat_settings_pkey" PRIMARY KEY ("our_jid", "chat_jid")
);
CREATE TABLE "public"."whatsmeow_contacts" ( 
  "our_jid" TEXT NOT NULL,
  "their_jid" TEXT NOT NULL,
  "first_name" TEXT NULL,
  "full_name" TEXT NULL,
  "push_name" TEXT NULL,
  "business_name" TEXT NULL,
  "redacted_phone" TEXT NULL,
  CONSTRAINT "whatsmeow_contacts_pkey" PRIMARY KEY ("our_jid", "their_jid")
);
CREATE TABLE "public"."whatsmeow_device" ( 
  "jid" TEXT NOT NULL,
  "lid" TEXT NULL,
  "facebook_uuid" UUID NULL,
  "registration_id" BIGINT NOT NULL,
  "noise_key" BYTEA NOT NULL,
  "identity_key" BYTEA NOT NULL,
  "signed_pre_key" BYTEA NOT NULL,
  "signed_pre_key_id" INTEGER NOT NULL,
  "signed_pre_key_sig" BYTEA NOT NULL,
  "adv_key" BYTEA NOT NULL,
  "adv_details" BYTEA NOT NULL,
  "adv_account_sig" BYTEA NOT NULL,
  "adv_account_sig_key" BYTEA NOT NULL,
  "adv_device_sig" BYTEA NOT NULL,
  "platform" TEXT NOT NULL DEFAULT ''::text ,
  "business_name" TEXT NOT NULL DEFAULT ''::text ,
  "push_name" TEXT NOT NULL DEFAULT ''::text ,
  "lid_migration_ts" BIGINT NOT NULL DEFAULT 0 ,
  CONSTRAINT "whatsmeow_device_pkey" PRIMARY KEY ("jid")
);
CREATE TABLE "public"."whatsmeow_event_buffer" ( 
  "our_jid" TEXT NOT NULL,
  "ciphertext_hash" BYTEA NOT NULL,
  "plaintext" BYTEA NULL,
  "server_timestamp" BIGINT NOT NULL,
  "insert_timestamp" BIGINT NOT NULL,
  CONSTRAINT "whatsmeow_event_buffer_pkey" PRIMARY KEY ("our_jid", "ciphertext_hash")
);
CREATE TABLE "public"."whatsmeow_identity_keys" ( 
  "our_jid" TEXT NOT NULL,
  "their_id" TEXT NOT NULL,
  "identity" BYTEA NOT NULL,
  CONSTRAINT "whatsmeow_identity_keys_pkey" PRIMARY KEY ("our_jid", "their_id")
);
CREATE TABLE "public"."whatsmeow_lid_map" ( 
  "lid" TEXT NOT NULL,
  "pn" TEXT NOT NULL,
  CONSTRAINT "whatsmeow_lid_map_pkey" PRIMARY KEY ("lid"),
  CONSTRAINT "whatsmeow_lid_map_pn_key" UNIQUE ("pn")
);
CREATE TABLE "public"."whatsmeow_message_secrets" ( 
  "our_jid" TEXT NOT NULL,
  "chat_jid" TEXT NOT NULL,
  "sender_jid" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "key" BYTEA NOT NULL,
  CONSTRAINT "whatsmeow_message_secrets_pkey" PRIMARY KEY ("our_jid", "chat_jid", "sender_jid", "message_id")
);
CREATE TABLE "public"."whatsmeow_pre_keys" ( 
  "jid" TEXT NOT NULL,
  "key_id" INTEGER NOT NULL,
  "key" BYTEA NOT NULL,
  "uploaded" BOOLEAN NOT NULL,
  CONSTRAINT "whatsmeow_pre_keys_pkey" PRIMARY KEY ("jid", "key_id")
);
CREATE TABLE "public"."whatsmeow_privacy_tokens" ( 
  "our_jid" TEXT NOT NULL,
  "their_jid" TEXT NOT NULL,
  "token" BYTEA NOT NULL,
  "timestamp" BIGINT NOT NULL,
  CONSTRAINT "whatsmeow_privacy_tokens_pkey" PRIMARY KEY ("our_jid", "their_jid")
);
CREATE TABLE "public"."whatsmeow_sender_keys" ( 
  "our_jid" TEXT NOT NULL,
  "chat_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "sender_key" BYTEA NOT NULL,
  CONSTRAINT "whatsmeow_sender_keys_pkey" PRIMARY KEY ("our_jid", "chat_id", "sender_id")
);
CREATE TABLE "public"."whatsmeow_sessions" ( 
  "our_jid" TEXT NOT NULL,
  "their_id" TEXT NOT NULL,
  "session" BYTEA NULL,
  CONSTRAINT "whatsmeow_sessions_pkey" PRIMARY KEY ("our_jid", "their_id")
);
CREATE TABLE "public"."whatsmeow_version" ( 
  "version" INTEGER NULL,
  "compat" INTEGER NULL
);

ALTER TABLE "public"."whatsmeow_app_state_mutation_macs" ADD CONSTRAINT "whatsmeow_app_state_mutation_macs_jid_name_fkey" FOREIGN KEY ("jid", "name") REFERENCES "public"."whatsmeow_app_state_version" ("jid", "name") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."whatsmeow_app_state_sync_keys" ADD CONSTRAINT "whatsmeow_app_state_sync_keys_jid_fkey" FOREIGN KEY ("jid") REFERENCES "public"."whatsmeow_device" ("jid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."whatsmeow_app_state_version" ADD CONSTRAINT "whatsmeow_app_state_version_jid_fkey" FOREIGN KEY ("jid") REFERENCES "public"."whatsmeow_device" ("jid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."whatsmeow_chat_settings" ADD CONSTRAINT "whatsmeow_chat_settings_our_jid_fkey" FOREIGN KEY ("our_jid") REFERENCES "public"."whatsmeow_device" ("jid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."whatsmeow_contacts" ADD CONSTRAINT "whatsmeow_contacts_our_jid_fkey" FOREIGN KEY ("our_jid") REFERENCES "public"."whatsmeow_device" ("jid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."whatsmeow_event_buffer" ADD CONSTRAINT "whatsmeow_event_buffer_our_jid_fkey" FOREIGN KEY ("our_jid") REFERENCES "public"."whatsmeow_device" ("jid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."whatsmeow_identity_keys" ADD CONSTRAINT "whatsmeow_identity_keys_our_jid_fkey" FOREIGN KEY ("our_jid") REFERENCES "public"."whatsmeow_device" ("jid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."whatsmeow_message_secrets" ADD CONSTRAINT "whatsmeow_message_secrets_our_jid_fkey" FOREIGN KEY ("our_jid") REFERENCES "public"."whatsmeow_device" ("jid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."whatsmeow_pre_keys" ADD CONSTRAINT "whatsmeow_pre_keys_jid_fkey" FOREIGN KEY ("jid") REFERENCES "public"."whatsmeow_device" ("jid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."whatsmeow_sender_keys" ADD CONSTRAINT "whatsmeow_sender_keys_our_jid_fkey" FOREIGN KEY ("our_jid") REFERENCES "public"."whatsmeow_device" ("jid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."whatsmeow_sessions" ADD CONSTRAINT "whatsmeow_sessions_our_jid_fkey" FOREIGN KEY ("our_jid") REFERENCES "public"."whatsmeow_device" ("jid") ON DELETE CASCADE ON UPDATE CASCADE;


-- 4. FUNCTIONS & TRIGGERS (CORE)
-- ------------------------------

CREATE OR REPLACE FUNCTION "public"."app_set_context"(IN p_tenant UUID, IN p_user UUID) RETURNS VOID LANGUAGE PLPGSQL AS $$
BEGIN
  PERFORM set_config('app.current_tenant', p_tenant::text, true);
  PERFORM set_config('app.current_user',  p_user::text,  true);
END 
$$;

CREATE OR REPLACE FUNCTION "public"."enforce_seat_limit"() RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
DECLARE
  v_limit int;
  v_active int;
BEGIN
  SELECT max_active_members INTO v_limit
  FROM public.tenants
  WHERE id = NEW.tenant_id;
  
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    SELECT COUNT(*) INTO v_active
    FROM public.users
    WHERE tenant_id = NEW.tenant_id
      AND status = 'active'
      AND id <> NEW.id;
  ELSE
    SELECT COUNT(*) INTO v_active
    FROM public.users
    WHERE tenant_id = NEW.tenant_id
      AND status = 'active';
  END IF;
  
  IF NEW.status = 'active' AND v_active >= v_limit THEN
    RAISE EXCEPTION 'Seat limit reached for tenant %, limit=%', NEW.tenant_id, v_limit;
  END IF;
  
  RETURN NEW;
END 
$$;

-- Trigger Seat Limit
CREATE TRIGGER trg_enforce_seat_limit
BEFORE INSERT OR UPDATE ON "public"."users"
FOR EACH ROW EXECUTE FUNCTION enforce_seat_limit();


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- Trigger Updated At
CREATE TRIGGER set_updated_at_chats BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_contacts BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- 5. BUSINESS LOGIC & SYNC TRIGGERS
-- ---------------------------------

CREATE OR REPLACE FUNCTION "public"."sync_whatsmeow_to_crm_contact"() RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
DECLARE
  v_tenant_id UUID;
  v_phone TEXT;
  v_full_name TEXT;
BEGIN
  -- Default Tenant: Ambil yang pertama
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1; 

  IF v_tenant_id IS NOT NULL THEN
    -- 1. Extract Phone Number (Ambil angka sebelum @)
    v_phone := split_part(NEW.their_jid, '@', 1);

    -- 2. Tentukan Nama dengan Prioritas: FullName > FirstName > PushName > Phone
    v_full_name := COALESCE(NEW.full_name, NEW.first_name, NEW.push_name);
    
    -- Fallback jika masih null, pakai nomor HP
    IF v_full_name IS NULL OR v_full_name = '' THEN
        v_full_name := v_phone;
    END IF;

    INSERT INTO contacts (tenant_id, jid, phone_number, full_name, updated_at)
    VALUES (
      v_tenant_id, 
      NEW.their_jid, 
      v_phone,
      v_full_name,
      now()
    )
    ON CONFLICT (tenant_id, jid) 
    DO UPDATE SET 
      -- OVERWRITE data yang ada (Force Update)
      phone_number = EXCLUDED.phone_number,
      full_name = EXCLUDED.full_name,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger Sync WhatsApp Contacts
CREATE TRIGGER trg_sync_wm_contacts
AFTER INSERT OR UPDATE ON "public"."whatsmeow_contacts"
FOR EACH ROW EXECUTE FUNCTION sync_whatsmeow_to_crm_contact();