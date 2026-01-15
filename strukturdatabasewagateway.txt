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
