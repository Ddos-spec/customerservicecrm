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
  CONSTRAINT "chats_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chats_tenant_id_contact_id_key" UNIQUE ("tenant_id", "contact_id")
);
CREATE TABLE "public"."contacts" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "tenant_id" UUID NOT NULL,
  "jid" TEXT NOT NULL,
  "phone_number" TEXT NULL,
  "display_name" TEXT NULL,
  "push_name" TEXT NULL,
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
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenants_session_id_key" UNIQUE ("session_id")
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
  "session_id" TEXT NULL,
  "user_session_id" TEXT NULL,
  "tenant_session_id" TEXT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);
CREATE INDEX "idx_audit_actor_time" 
ON "public"."audit_logs" (
  "actor_user_id" ASC,
  "created_at" DESC
);
CREATE INDEX "idx_audit_tenant_time" 
ON "public"."audit_logs" (
  "tenant_id" ASC,
  "created_at" DESC
);
CREATE INDEX "idx_chats_tenant_updated" 
ON "public"."chats" (
  "tenant_id" ASC,
  "updated_at" DESC
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
CREATE INDEX "idx_messages_wa_id" 
ON "public"."messages" (
  "wa_message_id" ASC
);
CREATE INDEX "idx_messages_chat_time" 
ON "public"."messages" (
  "chat_id" ASC,
  "created_at" ASC
);
CREATE INDEX "idx_outlet_channels_outlet_id" 
ON "public"."outlet_channels" (
  "outlet_id" ASC
);
CREATE INDEX "tenant_webhooks_tenant_id_idx" 
ON "public"."tenant_webhooks" (
  "tenant_id" ASC
);
CREATE UNIQUE INDEX "tenant_webhooks_tenant_url_idx" 
ON "public"."tenant_webhooks" (
  "tenant_id" ASC,
  "url" ASC
);
CREATE UNIQUE INDEX "tenants_session_id_idx" 
ON "public"."tenants" (
  "session_id" ASC
);
CREATE INDEX "user_invites_email_idx" 
ON "public"."user_invites" (
  "email" ASC
);
CREATE INDEX "user_invites_status_idx" 
ON "public"."user_invites" (
  "status" ASC
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
CREATE UNIQUE INDEX "users_session_id_idx" 
ON "public"."users" (
  "session_id" ASC
);
ALTER TABLE "public"."chats" ADD CONSTRAINT "chats_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."chats" ADD CONSTRAINT "chats_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."contacts" ADD CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."tenant_webhooks" ADD CONSTRAINT "tenant_webhooks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."user_invites" ADD CONSTRAINT "user_invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."user_invites" ADD CONSTRAINT "user_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
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
CREATE FUNCTION "public"."assert_contact_identifier_tenant"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.contacts WHERE id = NEW.contact_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'contact_id % not found', NEW.contact_id;
  END IF;

  IF NEW.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'tenant mismatch: contact_identifiers.tenant_id % <> contacts.tenant_id %', NEW.tenant_id, v_tenant;
  END IF;

  RETURN NEW;
END 
$$;
CREATE FUNCTION "public"."assert_conversation_tenant"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.contacts WHERE id = NEW.contact_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'contact_id % not found', NEW.contact_id;
  END IF;

  IF NEW.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'tenant mismatch: conversations.tenant_id % <> contacts.tenant_id %', NEW.tenant_id, v_tenant;
  END IF;

  RETURN NEW;
END 
$$;
CREATE FUNCTION "public"."assert_message_tenant"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.conversations WHERE id = NEW.conversation_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'conversation_id % not found', NEW.conversation_id;
  END IF;

  IF NEW.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'tenant mismatch: messages.tenant_id % <> conversations.tenant_id %', NEW.tenant_id, v_tenant;
  END IF;

  RETURN NEW;
END 
$$;
CREATE FUNCTION "public"."assign_conversation"(IN p_tenant UUID, IN p_conversation UUID, IN p_user UUID, IN p_by_user UUID) RETURNS VOID LANGUAGE PLPGSQL
AS
$$

BEGIN
  UPDATE conversations
  SET assigned_user_id = p_user
  WHERE id = p_conversation AND tenant_id = p_tenant;

  INSERT INTO conversation_events (tenant_id, conversation_id, event_type, payload, created_by_user_id)
  VALUES (p_tenant, p_conversation, 'assigned', jsonb_build_object('assigned_user_id', p_user), p_by_user);
END 
$$;
CREATE FUNCTION "public"."close_conversation"(IN p_tenant UUID, IN p_conversation UUID, IN p_by_user UUID) RETURNS VOID LANGUAGE PLPGSQL
AS
$$

BEGIN
  UPDATE conversations
  SET status = 'closed'
  WHERE id = p_conversation AND tenant_id = p_tenant;

  INSERT INTO conversation_events (tenant_id, conversation_id, event_type, created_by_user_id)
  VALUES (p_tenant, p_conversation, 'closed', p_by_user);
END 
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
CREATE FUNCTION "public"."enforce_seat_limit"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

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
    FROM public.tenant_members
    WHERE tenant_id = NEW.tenant_id
      AND status = 'active'
      AND id <> NEW.id;
  ELSE
    SELECT COUNT(*) INTO v_active
    FROM public.tenant_members
    WHERE tenant_id = NEW.tenant_id
      AND status = 'active';
  END IF;
  
  IF NEW.status = 'active' AND v_active >= v_limit THEN
    RAISE EXCEPTION 'Seat limit reached for tenant %, limit=%', NEW.tenant_id, v_limit;
  END IF;
  
  RETURN NEW;
END 
$$;
CREATE FUNCTION "public"."escalate_conversation"(IN p_tenant UUID, IN p_conversation UUID, IN p_reason TEXT, IN p_payload JSONB, IN p_by_user UUID) RETURNS VOID LANGUAGE PLPGSQL
AS
$$

BEGIN
  UPDATE conversations
  SET status = 'needs_human',
      escalated_at = COALESCE(escalated_at, now())
  WHERE id = p_conversation AND tenant_id = p_tenant;

  INSERT INTO conversation_events (tenant_id, conversation_id, event_type, reason, payload, created_by_user_id)
  VALUES (p_tenant, p_conversation, 'escalated', p_reason, p_payload, p_by_user);
END 
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
CREATE FUNCTION "public"."get_or_create_conversation"(IN p_tenant UUID, IN p_contact_id UUID, IN p_contact UUID, IN p_tenant_id INTEGER, IN p_channel TEXT, IN p_channel VARCHAR, IN p_bot_number VARCHAR) RETURNS UUID|UUID LANGUAGE PLPGSQL
AS
$$

DECLARE
  v_conversation_id UUID;
BEGIN
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE contact_id = p_contact_id
    AND status != 'closed'
    AND channel = p_channel
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_conversation_id IS NULL THEN
    INSERT INTO conversations (contact_id, tenant_id, channel, bot_number, status)
    VALUES (p_contact_id, p_tenant_id, p_channel, p_bot_number, 'open')
    RETURNING id INTO v_conversation_id;
  END IF;
  
  RETURN v_conversation_id;
END;

$$;
CREATE FUNCTION "public"."hmac"() RETURNS BYTEA|BYTEA LANGUAGE C
AS
$$
pg_hmac
$$;
CREATE FUNCTION "public"."log_message"(IN p_tenant UUID, IN p_conversation UUID, IN p_sender USER-DEFINED, IN p_message_type USER-DEFINED, IN p_body TEXT, IN p_external_id TEXT, IN p_sender_user UUID, IN p_meta JSONB) RETURNS UUID LANGUAGE PLPGSQL
AS
$$

DECLARE
  v_message_id uuid;
BEGIN
  INSERT INTO messages (tenant_id, conversation_id, sender, sender_user_id, message_type, body, external_message_id, meta)
  VALUES (p_tenant, p_conversation, p_sender, p_sender_user, p_message_type, p_body, p_external_id, p_meta)
  ON CONFLICT (tenant_id, external_message_id)
  DO UPDATE SET meta = EXCLUDED.meta
  RETURNING id INTO v_message_id;

  UPDATE conversations
  SET last_message_at = now()
  WHERE id = p_conversation;

  RETURN v_message_id;
END 
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
CREATE FUNCTION "public"."update_updated_at_column"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."upsert_contact_by_identifier"(IN p_tenant UUID, IN p_tenant_id INTEGER, IN p_channel VARCHAR, IN p_kind TEXT, IN p_value TEXT, IN p_identifier VARCHAR, IN p_name VARCHAR, IN p_push_name TEXT, IN p_metadata JSONB) RETURNS UUID|UUID LANGUAGE PLPGSQL
AS
$$

DECLARE
  v_contact_id uuid;
BEGIN
  SELECT contact_id INTO v_contact_id
  FROM contact_identifiers
  WHERE tenant_id = p_tenant AND kind = p_kind AND value = p_value;

  IF v_contact_id IS NULL THEN
    INSERT INTO contacts (tenant_id, push_name)
    VALUES (p_tenant, p_push_name)
    RETURNING id INTO v_contact_id;

    INSERT INTO contact_identifiers (tenant_id, contact_id, kind, value, is_primary, active)
    VALUES (p_tenant, v_contact_id, p_kind, p_value, true, true);
  ELSE
    -- update push_name kalau ada
    UPDATE contacts
    SET push_name = COALESCE(p_push_name, push_name)
    WHERE id = v_contact_id;
  END IF;

  RETURN v_contact_id;
END 
$$;
