-- Schema cleanup (Phase 1-3 alignment)
-- Safe to re-run.

-- Ensure foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_tenant_id_fkey') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id)
      REFERENCES public.tenants (id) ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_tenant_id_fkey') THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_tenant_id_fkey FOREIGN KEY (tenant_id)
      REFERENCES public.tenants (id) ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chats_tenant_id_fkey') THEN
    ALTER TABLE public.chats
      ADD CONSTRAINT chats_tenant_id_fkey FOREIGN KEY (tenant_id)
      REFERENCES public.tenants (id) ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chats_contact_id_fkey') THEN
    ALTER TABLE public.chats
      ADD CONSTRAINT chats_contact_id_fkey FOREIGN KEY (contact_id)
      REFERENCES public.contacts (id) ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chats_assigned_to_fkey') THEN
    ALTER TABLE public.chats
      ADD CONSTRAINT chats_assigned_to_fkey FOREIGN KEY (assigned_to)
      REFERENCES public.users (id) ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

-- Ensure unique constraints without duplicate indexes
DO $$
DECLARE
  constraint_idx oid;
  idx_oid oid;
BEGIN
  SELECT conindid INTO constraint_idx
  FROM pg_constraint
  WHERE conname = 'tenants_session_id_key'
    AND conrelid = 'public.tenants'::regclass;

  SELECT oid INTO idx_oid
  FROM pg_class
  WHERE relname = 'tenants_session_id_idx';

  IF constraint_idx IS NULL THEN
    IF idx_oid IS NOT NULL THEN
      EXECUTE 'ALTER TABLE public.tenants ADD CONSTRAINT tenants_session_id_key UNIQUE USING INDEX tenants_session_id_idx';
    ELSE
      EXECUTE 'ALTER TABLE public.tenants ADD CONSTRAINT tenants_session_id_key UNIQUE (session_id)';
    END IF;
  ELSE
    IF idx_oid IS NOT NULL AND idx_oid <> constraint_idx THEN
      EXECUTE 'DROP INDEX IF EXISTS public.tenants_session_id_idx';
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  constraint_idx oid;
  idx_oid oid;
BEGIN
  SELECT conindid INTO constraint_idx
  FROM pg_constraint
  WHERE conname = 'tenant_webhooks_tenant_id_url_key'
    AND conrelid = 'public.tenant_webhooks'::regclass;

  SELECT oid INTO idx_oid
  FROM pg_class
  WHERE relname = 'tenant_webhooks_tenant_url_idx';

  IF constraint_idx IS NULL THEN
    IF idx_oid IS NOT NULL THEN
      EXECUTE 'ALTER TABLE public.tenant_webhooks ADD CONSTRAINT tenant_webhooks_tenant_id_url_key UNIQUE USING INDEX tenant_webhooks_tenant_url_idx';
    ELSE
      EXECUTE 'ALTER TABLE public.tenant_webhooks ADD CONSTRAINT tenant_webhooks_tenant_id_url_key UNIQUE (tenant_id, url)';
    END IF;
  ELSE
    IF idx_oid IS NOT NULL AND idx_oid <> constraint_idx THEN
      EXECUTE 'DROP INDEX IF EXISTS public.tenant_webhooks_tenant_url_idx';
    END IF;
  END IF;
END $$;

-- Drop legacy seat limit trigger function if unused
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'enforce_seat_limit'
      AND pronamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.proname = 'enforce_seat_limit'
      AND p.pronamespace = 'public'::regnamespace
  ) THEN
    DROP FUNCTION public.enforce_seat_limit();
  END IF;
END $$;

-- Ensure contact sync trigger exists
CREATE OR REPLACE FUNCTION public.sync_whatsmeow_to_crm_contact()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
DECLARE
  v_tenant_id UUID;
  v_our_phone TEXT;
  v_phone TEXT;
  v_full_name TEXT;
BEGIN
  v_our_phone := split_part(NEW.our_jid, '@', 1);

  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE session_id = v_our_phone AND status = 'active'
  LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    v_phone := split_part(NEW.their_jid, '@', 1);
    v_full_name := COALESCE(NEW.full_name, NEW.first_name, NEW.push_name);

    IF v_full_name IS NULL OR v_full_name = '' THEN
        v_full_name := v_phone;
    END IF;

    INSERT INTO public.contacts (tenant_id, jid, phone_number, full_name, updated_at)
    VALUES (v_tenant_id, NEW.their_jid, v_phone, v_full_name, now())
    ON CONFLICT (tenant_id, jid)
    DO UPDATE SET
      phone_number = EXCLUDED.phone_number,
      full_name = EXCLUDED.full_name,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_wm_contacts') THEN
    CREATE TRIGGER trg_sync_wm_contacts
    AFTER INSERT OR UPDATE ON public.whatsmeow_contacts
    FOR EACH ROW EXECUTE FUNCTION public.sync_whatsmeow_to_crm_contact();
  END IF;
END
$$;
