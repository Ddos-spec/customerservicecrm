CREATE TABLE "public"."audit_logs" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "tenant_id" UUID NULL,
  "actor_user_id" UUID NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT NULL,
  "target_id" UUID NULL,
  "ip" TEXT NULL,
  "user_agent" TEXT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb ,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() ,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."campaign_messages" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "campaign_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "phone_number" TEXT NOT NULL,
  "status" VARCHAR(20) NULL DEFAULT 'pending'::character varying ,
  "error_message" TEXT NULL,
  "sent_at" TIMESTAMP WITH TIME ZONE NULL,
  "wa_message_id" TEXT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "updated_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  CONSTRAINT "campaign_messages_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."campaigns" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "message_template" TEXT NOT NULL,
  "status" VARCHAR(20) NULL DEFAULT 'draft'::character varying ,
  "scheduled_at" TIMESTAMP WITH TIME ZONE NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "completed_at" TIMESTAMP WITH TIME ZONE NULL,
  "total_targets" INTEGER NULL DEFAULT 0 ,
  "success_count" INTEGER NULL DEFAULT 0 ,
  "failed_count" INTEGER NULL DEFAULT 0 ,
  "updated_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."chats" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "tenant_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "assigned_to" UUID NULL,
  "status" VARCHAR(20) NULL DEFAULT 'open'::character varying ,
  "unread_count" INTEGER NULL DEFAULT 0 ,
  "last_message_preview" TEXT NULL,
  "last_message_time" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "last_message_type" VARCHAR(20) NULL DEFAULT 'text'::character varying ,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "updated_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "is_group" BOOLEAN NOT NULL DEFAULT false ,
  CONSTRAINT "chats_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chats_tenant_id_contact_id_key" UNIQUE ("tenant_id", "contact_id")
);
CREATE TABLE "public"."contact_group_members" ( 
  "contact_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "joined_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  CONSTRAINT "contact_group_members_pkey" PRIMARY KEY ("contact_id", "group_id")
);
CREATE TABLE "public"."contact_groups" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "updated_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_groups_tenant_id_name_key" UNIQUE ("tenant_id", "name")
);
CREATE TABLE "public"."contacts" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "tenant_id" UUID NOT NULL,
  "jid" TEXT NOT NULL,
  "phone_number" TEXT NULL,
  "full_name" TEXT NULL,
  "profile_pic_url" TEXT NULL,
  "is_business" BOOLEAN NULL DEFAULT false ,
  "about_status" TEXT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "updated_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contacts_tenant_id_jid_key" UNIQUE ("tenant_id", "jid")
);
CREATE TABLE "public"."message_attachments" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "tenant_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" BIGINT NULL,
  "duration_ms" INTEGER NULL,
  "storage_provider" TEXT NOT NULL DEFAULT 's3'::text ,
  "storage_key" TEXT NOT NULL,
  "thumbnail_key" TEXT NULL,
  "sha256" TEXT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() ,
  CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."messages" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "chat_id" UUID NOT NULL,
  "sender_type" VARCHAR(20) NOT NULL,
  "sender_id" TEXT NULL,
  "sender_name" TEXT NULL,
  "message_type" VARCHAR(20) NULL DEFAULT 'text'::character varying ,
  "body" TEXT NULL,
  "media_url" TEXT NULL,
  "wa_message_id" TEXT NULL,
  "is_from_me" BOOLEAN NULL DEFAULT false ,
  "status" VARCHAR(20) NULL DEFAULT 'sent'::character varying ,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."outlet_channels" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "outlet_id" INTEGER NOT NULL,
  "channel" VARCHAR(50) NULL DEFAULT 'whatsapp'::character varying ,
  "channel_identifier" VARCHAR(255) NULL,
  "created_at" TIMESTAMP NULL DEFAULT now() ,
  CONSTRAINT "outlet_channels_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."system_settings" ( 
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
CREATE TABLE "public"."tenant_webhooks" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "tenant_id" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  CONSTRAINT "tenant_webhooks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_webhooks_tenant_id_url_key" UNIQUE ("tenant_id", "url")
);
CREATE TABLE "public"."tenants" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "company_name" TEXT NOT NULL,
  "status" VARCHAR(20) NULL DEFAULT 'active'::character varying ,
  "session_id" TEXT NULL,
  "max_active_members" INTEGER NULL DEFAULT 100 ,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "gateway_url" TEXT NULL,
  "api_key" TEXT NULL,
  "wa_provider" VARCHAR(20) NULL DEFAULT 'whatsmeow'::character varying ,
  "meta_phone_id" TEXT NULL,
  "meta_waba_id" TEXT NULL,
  "meta_token" TEXT NULL,
  "webhook_events" JSONB NULL DEFAULT '{"self": false, "groups": true, "private": true}'::jsonb ,
  "business_category" VARCHAR(50) NULL DEFAULT 'general'::character varying ,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenants_session_id_key" UNIQUE ("session_id"),
  CONSTRAINT "tenants_api_key_key" UNIQUE ("api_key")
);
CREATE TABLE "public"."user_invites" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" VARCHAR(20) NOT NULL DEFAULT 'agent'::character varying ,
  "token" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending'::character varying ,
  "created_by" UUID NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "expires_at" TIMESTAMP WITH TIME ZONE NULL,
  "phone_number" TEXT NULL,
  "last_error" TEXT NULL,
  CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_invites_token_key" UNIQUE ("token")
);
CREATE TABLE "public"."users" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "tenant_id" UUID NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NULL DEFAULT 'active'::character varying ,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "phone_number" TEXT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);
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
CREATE INDEX "idx_audit_tenant_time" 
ON "public"."audit_logs" (
  "tenant_id" ASC,
  "created_at" DESC
);
CREATE INDEX "idx_audit_actor_time" 
ON "public"."audit_logs" (
  "actor_user_id" ASC,
  "created_at" DESC
);
CREATE INDEX "idx_campaign_messages_contact" 
ON "public"."campaign_messages" (
  "contact_id" ASC
);
CREATE INDEX "idx_campaign_messages_queue" 
ON "public"."campaign_messages" (
  "campaign_id" ASC,
  "status" ASC
);
CREATE INDEX "idx_campaign_queue" 
ON "public"."campaign_messages" (
  "campaign_id" ASC,
  "status" ASC
);
CREATE INDEX "idx_campaign_messages_sent" 
ON "public"."campaign_messages" (
  "sent_at" ASC
);
CREATE INDEX "idx_campaigns_tenant_status" 
ON "public"."campaigns" (
  "tenant_id" ASC,
  "status" ASC
);
CREATE INDEX "idx_campaigns_scheduled" 
ON "public"."campaigns" (
  "scheduled_at" ASC
);
CREATE INDEX "idx_chats_tenant_updated" 
ON "public"."chats" (
  "tenant_id" ASC,
  "updated_at" DESC
);
CREATE INDEX "idx_group_members_group" 
ON "public"."contact_group_members" (
  "group_id" ASC
);
CREATE INDEX "idx_contact_groups_tenant" 
ON "public"."contact_groups" (
  "tenant_id" ASC
);
CREATE INDEX "idx_contacts_tenant_jid" 
ON "public"."contacts" (
  "tenant_id" ASC,
  "jid" ASC
);
CREATE INDEX "idx_attachments_message" 
ON "public"."message_attachments" (
  "message_id" ASC
);
CREATE UNIQUE INDEX "messages_wa_message_id_key" 
ON "public"."messages" (
  "wa_message_id" ASC
);
CREATE INDEX "idx_messages_chat_time" 
ON "public"."messages" (
  "chat_id" ASC,
  "created_at" ASC
);
CREATE INDEX "idx_messages_wa_id" 
ON "public"."messages" (
  "wa_message_id" ASC
);
CREATE INDEX "idx_outlet_channels_outlet_id" 
ON "public"."outlet_channels" (
  "outlet_id" ASC
);
CREATE INDEX "tenant_webhooks_tenant_id_idx" 
ON "public"."tenant_webhooks" (
  "tenant_id" ASC
);
CREATE INDEX "idx_tenants_meta_phone_id" 
ON "public"."tenants" (
  "meta_phone_id" ASC
);
CREATE UNIQUE INDEX "tenants_meta_phone_id_key" 
ON "public"."tenants" (
  "meta_phone_id" ASC
);
CREATE INDEX "user_invites_status_idx" 
ON "public"."user_invites" (
  "status" ASC
);
CREATE INDEX "user_invites_email_idx" 
ON "public"."user_invites" (
  "email" ASC
);
CREATE INDEX "user_invites_tenant_id_idx" 
ON "public"."user_invites" (
  "tenant_id" ASC
);
CREATE INDEX "idx_users_tenant_role_status" 
ON "public"."users" (
  "tenant_id" ASC,
  "role" ASC,
  "status" ASC
);
ALTER TABLE "public"."campaign_messages" ADD CONSTRAINT "campaign_messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."campaign_messages" ADD CONSTRAINT "campaign_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."chats" ADD CONSTRAINT "chats_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."chats" ADD CONSTRAINT "chats_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."chats" ADD CONSTRAINT "chats_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."contact_group_members" ADD CONSTRAINT "contact_group_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."contact_group_members" ADD CONSTRAINT "contact_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."contact_groups" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."contact_groups" ADD CONSTRAINT "contact_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."contacts" ADD CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."tenant_webhooks" ADD CONSTRAINT "tenant_webhooks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."user_invites" ADD CONSTRAINT "user_invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."user_invites" ADD CONSTRAINT "user_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
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
CREATE FUNCTION "public"."app_set_context"(IN p_tenant UUID, IN p_user UUID) RETURNS VOID LANGUAGE PLPGSQL
AS
$$

BEGIN
  PERFORM set_config('app.current_tenant', p_tenant::text, true);
  PERFORM set_config('app.current_user',  p_user::text,  true);
END 

$$;
CREATE FUNCTION "public"."armor"() RETURNS TEXT|TEXT LANGUAGE C
AS
$$
pg_armor
$$;
CREATE FUNCTION "public"."crypt"() RETURNS TEXT LANGUAGE C
AS
$$
pg_crypt
$$;
CREATE FUNCTION "public"."dearmor"() RETURNS BYTEA LANGUAGE C
AS
$$
pg_dearmor
$$;
CREATE FUNCTION "public"."decrypt"() RETURNS BYTEA LANGUAGE C
AS
$$
pg_decrypt
$$;
CREATE FUNCTION "public"."decrypt_iv"() RETURNS BYTEA LANGUAGE C
AS
$$
pg_decrypt_iv
$$;
CREATE FUNCTION "public"."digest"() RETURNS BYTEA|BYTEA LANGUAGE C
AS
$$
pg_digest
$$;
CREATE FUNCTION "public"."encrypt"() RETURNS BYTEA LANGUAGE C
AS
$$
pg_encrypt
$$;
CREATE FUNCTION "public"."encrypt_iv"() RETURNS BYTEA LANGUAGE C
AS
$$
pg_encrypt_iv
$$;
CREATE FUNCTION "public"."gen_random_bytes"() RETURNS BYTEA LANGUAGE C
AS
$$
pg_random_bytes
$$;
CREATE FUNCTION "public"."gen_random_uuid"() RETURNS UUID LANGUAGE C
AS
$$
pg_random_uuid
$$;
CREATE FUNCTION "public"."gen_salt"() RETURNS TEXT|TEXT LANGUAGE C
AS
$$
pg_gen_salt_rounds
$$;
CREATE FUNCTION "public"."hmac"() RETURNS BYTEA|BYTEA LANGUAGE C
AS
$$
pg_hmac
$$;
CREATE FUNCTION "public"."pgp_armor_headers"(OUT key TEXT, OUT value TEXT) RETURNS RECORD LANGUAGE C
AS
$$
pgp_armor_headers
$$;
CREATE FUNCTION "public"."pgp_key_id"() RETURNS TEXT LANGUAGE C
AS
$$
pgp_key_id_w
$$;
CREATE FUNCTION "public"."pgp_pub_decrypt"() RETURNS TEXT|TEXT|TEXT LANGUAGE C
AS
$$
pgp_pub_decrypt_text
$$;
CREATE FUNCTION "public"."pgp_pub_decrypt_bytea"() RETURNS BYTEA|BYTEA|BYTEA LANGUAGE C
AS
$$
pgp_pub_decrypt_bytea
$$;
CREATE FUNCTION "public"."pgp_pub_encrypt"() RETURNS BYTEA|BYTEA LANGUAGE C
AS
$$
pgp_pub_encrypt_text
$$;
CREATE FUNCTION "public"."pgp_pub_encrypt_bytea"() RETURNS BYTEA|BYTEA LANGUAGE C
AS
$$
pgp_pub_encrypt_bytea
$$;
CREATE FUNCTION "public"."pgp_sym_decrypt"() RETURNS TEXT|TEXT LANGUAGE C
AS
$$
pgp_sym_decrypt_text
$$;
CREATE FUNCTION "public"."pgp_sym_decrypt_bytea"() RETURNS BYTEA|BYTEA LANGUAGE C
AS
$$
pgp_sym_decrypt_bytea
$$;
CREATE FUNCTION "public"."pgp_sym_encrypt"() RETURNS BYTEA|BYTEA LANGUAGE C
AS
$$
pgp_sym_encrypt_text
$$;
CREATE FUNCTION "public"."pgp_sym_encrypt_bytea"() RETURNS BYTEA|BYTEA LANGUAGE C
AS
$$
pgp_sym_encrypt_bytea
$$;
CREATE FUNCTION "public"."set_updated_at"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END 
$$;
CREATE FUNCTION "public"."sync_whatsmeow_to_crm_contact"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

            DECLARE
              v_tenant_id UUID;
              v_our_phone TEXT;
              v_phone TEXT;
              v_full_name TEXT;
              v_their_jid TEXT;
              v_lid TEXT;
              v_pn TEXT;
            BEGIN
              -- Extract phone number from our_jid (e.g., 6289xxx@s.whatsapp.net → 6289xxx)
              v_our_phone := split_part(NEW.our_jid, '@', 1);

              -- Match our_jid with tenant's session_id for proper tenant isolation
              SELECT id INTO v_tenant_id FROM tenants
              WHERE session_id = v_our_phone AND status = 'active'
              LIMIT 1;

              IF v_tenant_id IS NOT NULL THEN
                v_their_jid := NEW.their_jid;

                IF v_their_jid LIKE '%@lid' OR v_their_jid LIKE '%@lid.whatsapp.net' THEN
                  v_lid := split_part(v_their_jid, '@', 1);
                  SELECT pn INTO v_pn FROM whatsmeow_lid_map WHERE lid = v_lid LIMIT 1;
                  IF v_pn IS NOT NULL AND v_pn <> '' THEN
                    v_their_jid := v_pn || '@s.whatsapp.net';
                  END IF;
                END IF;

                v_phone := split_part(v_their_jid, '@', 1);
                -- Priority: FullName > FirstName > PushName > Phone
                v_full_name := COALESCE(NEW.full_name, NEW.first_name, NEW.push_name);

                IF v_full_name IS NULL OR v_full_name = '' THEN
                    v_full_name := v_phone;
                END IF;

                INSERT INTO contacts (tenant_id, jid, phone_number, full_name, updated_at)
                VALUES (v_tenant_id, v_their_jid, v_phone, v_full_name, now())
                ON CONFLICT (tenant_id, jid)
                DO UPDATE SET
                  phone_number = EXCLUDED.phone_number,
                  full_name = EXCLUDED.full_name,
                  updated_at = now();
              END IF;

              RETURN NEW;
            END;
            
$$;
CREATE FUNCTION "public"."update_campaign_stats"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
    UPDATE "public"."campaigns"
    SET 
        "success_count" = (
            SELECT COUNT(*) 
            FROM "public"."campaign_messages" 
            WHERE "campaign_id" = NEW."campaign_id" AND "status" = 'sent'
        ),
        "failed_count" = (
            SELECT COUNT(*) 
            FROM "public"."campaign_messages" 
            WHERE "campaign_id" = NEW."campaign_id" AND "status" = 'failed'
        ),
        "updated_at" = now()
    WHERE "id" = NEW."campaign_id";
    
    RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."update_updated_at_column"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
    NEW."updated_at" = now();
    RETURN NEW;
END;

$$;
