-- ============================================================================
-- সব পাগলা — পাগলের দুনিয়া 😂
-- Complete Supabase PostgreSQL Schema, RLS Policies, Storage & Secure Admin RPCs
-- ============================================================================

-- 1. Enable required extensions (pgcrypto lives in extensions schema on Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 60),
  username text NOT NULL CHECK (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 240),
  avatar_url text NOT NULL DEFAULT '',
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uidx
  ON public.profiles (lower(username));

CREATE TABLE IF NOT EXISTS public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url text NOT NULL CHECK (char_length(image_url) BETWEEN 10 AND 1000),
  storage_path text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 300),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photos_status_created_idx
  ON public.photos (status, created_at DESC);

CREATE INDEX IF NOT EXISTS photos_user_status_idx
  ON public.photos (user_id, status);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (char_length(trim(event)) BETWEEN 1 AND 64),
  user_agent text NOT NULL DEFAULT '',
  referrer text NOT NULL DEFAULT '',
  ip_address text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_created_idx
  ON public.activity_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_event_idx
  ON public.activity_logs (event);

CREATE TABLE IF NOT EXISTS public.admin_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  token_hash text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx
  ON public.admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.site_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_name text NOT NULL DEFAULT 'সব পাগলা' CHECK (char_length(trim(site_name)) BETWEEN 1 AND 60),
  tagline text NOT NULL DEFAULT 'পাগলের দুনিয়া 😂' CHECK (char_length(trim(tagline)) BETWEEN 1 AND 120),
  gallery_page_size integer NOT NULL DEFAULT 12 CHECK (gallery_page_size BETWEEN 4 AND 48),
  max_upload_mb integer NOT NULL DEFAULT 8 CHECK (max_upload_mb BETWEEN 1 AND 8),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Seed Initial Admin Password Hash & Site Settings
-- ----------------------------------------------------------------------------
-- Initial admin password: Admin1122 (stored strictly as bcrypt hash, never plaintext in frontend)
INSERT INTO public.admin_settings (id, password_hash)
VALUES (1, extensions.crypt('Admin1122', extensions.gen_salt('bf', 10)))
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.site_settings (id, site_name, tagline, gallery_page_size, max_upload_mb)
VALUES (1, 'সব পাগলা', 'পাগলের দুনিয়া 😂', 12, 8)
ON CONFLICT (id) DO NOTHING;

-- 4. Triggers (updated_at & profile field protection)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_photos_updated_at ON public.photos;
CREATE TRIGGER trg_photos_updated_at
  BEFORE UPDATE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_admin_settings_updated_at ON public.admin_settings;
CREATE TRIGGER trg_admin_settings_updated_at
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER trg_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Prevent regular authenticated clients from changing username or unblocking themselves
CREATE OR REPLACE FUNCTION public.protect_profile_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.username IS DISTINCT FROM OLD.username THEN
      RAISE EXCEPTION 'Username পরিবর্তন করা যাবে না।';
    END IF;
    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
      RAISE EXCEPTION 'Account status পরিবর্তন করার অনুমতি নেই।';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_immutable_fields();

-- 5. Enable Row Level Security (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "Public can view non-blocked profiles" ON public.profiles;
CREATE POLICY "Public can view non-blocked profiles"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_blocked = false OR auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id AND is_blocked = false);

DROP POLICY IF EXISTS "Active users can update own profile" ON public.profiles;
CREATE POLICY "Active users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id AND is_blocked = false)
  WITH CHECK (auth.uid() = id AND is_blocked = false);

-- Photos policies
DROP POLICY IF EXISTS "Public can view approved photos from active users" ON public.photos;
CREATE POLICY "Public can view approved photos from active users"
  ON public.photos FOR SELECT
  TO anon, authenticated
  USING (
    (
      status = 'approved'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = photos.user_id AND p.is_blocked = false
      )
    )
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Active authenticated users can upload pending photos" ON public.photos;
CREATE POLICY "Active authenticated users can upload pending photos"
  ON public.photos FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_blocked = false
    )
  );

-- Activity logs policies (Insert own logs, NO public SELECT)
DROP POLICY IF EXISTS "Authenticated users can insert own activity logs" ON public.activity_logs;
CREATE POLICY "Authenticated users can insert own activity logs"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND ip_address IS NULL);

-- Site settings policies (Public read, Admin-only write via RPC)
DROP POLICY IF EXISTS "Public can read site settings" ON public.site_settings;
CREATE POLICY "Public can read site settings"
  ON public.site_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Note: admin_settings and admin_sessions intentionally have ZERO RLS policies
-- for anon/authenticated, blocking all direct PostgREST access.

-- 6. Public Helper RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(trim(p_username))
  );
$$;

CREATE OR REPLACE FUNCTION public.get_public_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_friends', (SELECT count(*) FROM public.profiles WHERE is_blocked = false),
    'approved_photos', (
      SELECT count(*) FROM public.photos ph
      JOIN public.profiles pr ON pr.id = ph.user_id
      WHERE ph.status = 'approved' AND pr.is_blocked = false
    ),
    'pending_photos', (SELECT count(*) FROM public.photos WHERE status = 'pending')
  );
$$;

CREATE OR REPLACE FUNCTION public.log_client_activity(
  p_event text,
  p_user_agent text DEFAULT '',
  p_referrer text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  INSERT INTO public.activity_logs (user_id, event, user_agent, referrer, ip_address, metadata)
  VALUES (
    v_uid,
    left(coalesce(nullif(trim(p_event), ''), 'unknown'), 64),
    left(coalesce(p_user_agent, ''), 500),
    left(coalesce(p_referrer, ''), 500),
    NULL,
    coalesce(p_metadata, '{}'::jsonb)
  );
END;
$$;

-- 7. Internal Helper: Assert Valid Admin Session
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_admin_token(p_admin_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_valid boolean;
BEGIN
  IF p_admin_token IS NULL OR length(trim(p_admin_token)) < 16 THEN
    RAISE EXCEPTION 'Unauthorized: Admin session token missing or invalid.';
  END IF;

  -- Clean expired sessions opportunistically
  DELETE FROM public.admin_sessions WHERE expires_at <= now();

  v_hash := encode(extensions.digest(p_admin_token, 'sha256'), 'hex');

  SELECT EXISTS (
    SELECT 1 FROM public.admin_sessions
    WHERE token_hash = v_hash AND expires_at > now()
  ) INTO v_valid;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Unauthorized: Admin session expired or invalid.';
  END IF;
END;
$$;

-- 8. Admin Security & Management RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_admin_login(
  p_password text,
  p_user_agent text DEFAULT '',
  p_referrer text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_stored_hash text;
  v_token text;
  v_token_hash text;
BEGIN
  SELECT password_hash INTO v_stored_hash FROM public.admin_settings WHERE id = 1;

  IF v_stored_hash IS NULL OR extensions.crypt(coalesce(p_password, ''), v_stored_hash) <> v_stored_hash THEN
    INSERT INTO public.activity_logs (user_id, event, user_agent, referrer, metadata)
    VALUES (auth.uid(), 'admin_login_failed', left(coalesce(p_user_agent, ''), 500), left(coalesce(p_referrer, ''), 500), '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'ভুল অ্যাডমিন পাসওয়ার্ড।');
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.admin_sessions (token_hash, expires_at)
  VALUES (v_token_hash, now() + interval '12 hours');

  INSERT INTO public.activity_logs (user_id, event, user_agent, referrer, metadata)
  VALUES (auth.uid(), 'admin_login', left(coalesce(p_user_agent, ''), 500), left(coalesce(p_referrer, ''), 500), '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_logout(p_admin_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_hash text;
BEGIN
  IF p_admin_token IS NOT NULL AND length(p_admin_token) > 0 THEN
    v_token_hash := encode(extensions.digest(p_admin_token, 'sha256'), 'hex');
    DELETE FROM public.admin_sessions WHERE token_hash = v_token_hash;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_data(p_admin_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_stats jsonb;
  v_users jsonb;
  v_photos jsonb;
  v_logs jsonb;
  v_settings jsonb;
BEGIN
  PERFORM public._assert_admin_token(p_admin_token);

  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'blocked_users', (SELECT count(*) FROM public.profiles WHERE is_blocked = true),
    'total_photos', (SELECT count(*) FROM public.photos),
    'approved_photos', (SELECT count(*) FROM public.photos WHERE status = 'approved'),
    'pending_photos', (SELECT count(*) FROM public.photos WHERE status = 'pending'),
    'rejected_photos', (SELECT count(*) FROM public.photos WHERE status = 'rejected')
  ) INTO v_stats;

  SELECT coalesce(jsonb_agg(u ORDER BY u.created_at DESC), '[]'::jsonb)
  INTO v_users
  FROM (
    SELECT
      p.id,
      p.display_name,
      p.username,
      p.bio,
      p.avatar_url,
      p.is_blocked,
      p.created_at,
      (SELECT count(*) FROM public.photos ph WHERE ph.user_id = p.id) AS photo_count,
      (SELECT count(*) FROM public.photos ph WHERE ph.user_id = p.id AND ph.status = 'approved') AS approved_count
    FROM public.profiles p
  ) u;

  SELECT coalesce(jsonb_agg(ph ORDER BY ph.created_at DESC), '[]'::jsonb)
  INTO v_photos
  FROM (
    SELECT
      p.id,
      p.user_id,
      p.image_url,
      p.storage_path,
      p.caption,
      p.status,
      p.created_at,
      pr.display_name AS uploader_name,
      pr.username AS uploader_username
    FROM public.photos p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
  ) ph;

  SELECT coalesce(jsonb_agg(l ORDER BY l.created_at DESC), '[]'::jsonb)
  INTO v_logs
  FROM (
    SELECT
      al.id,
      al.user_id,
      pr.username,
      pr.display_name,
      al.event,
      al.user_agent,
      al.referrer,
      al.ip_address,
      al.metadata,
      al.created_at
    FROM public.activity_logs al
    LEFT JOIN public.profiles pr ON pr.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT 150
  ) l;

  SELECT to_jsonb(s) INTO v_settings FROM public.site_settings s WHERE s.id = 1;

  RETURN jsonb_build_object(
    'stats', v_stats,
    'users', v_users,
    'photos', v_photos,
    'logs', v_logs,
    'settings', v_settings
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_moderate_photo(
  p_admin_token text,
  p_photo_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_photo public.photos%ROWTYPE;
  v_event text;
BEGIN
  PERFORM public._assert_admin_token(p_admin_token);

  SELECT * INTO v_photo FROM public.photos WHERE id = p_photo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Photo not found.';
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.photos SET status = 'approved' WHERE id = p_photo_id;
    v_event := 'photo_approved';
  ELSIF p_action = 'reject' THEN
    UPDATE public.photos SET status = 'rejected' WHERE id = p_photo_id;
    v_event := 'photo_rejected';
  ELSIF p_action = 'delete' THEN
    DELETE FROM public.photos WHERE id = p_photo_id;
    IF v_photo.storage_path <> '' THEN
      DELETE FROM storage.objects WHERE bucket_id = 'photos' AND name = v_photo.storage_path;
    END IF;
    v_event := 'photo_deleted';
  ELSE
    RAISE EXCEPTION 'Invalid moderation action.';
  END IF;

  INSERT INTO public.activity_logs (user_id, event, metadata)
  VALUES (v_photo.user_id, v_event, jsonb_build_object('photo_id', p_photo_id));

  RETURN jsonb_build_object('success', true, 'action', p_action, 'photo_id', p_photo_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_block_user(
  p_admin_token text,
  p_user_id uuid,
  p_block boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._assert_admin_token(p_admin_token);

  UPDATE public.profiles SET is_blocked = p_block WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  INSERT INTO public.activity_logs (user_id, event, metadata)
  VALUES (p_user_id, CASE WHEN p_block THEN 'user_blocked' ELSE 'user_unblocked' END, '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'is_blocked', p_block);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_settings(
  p_admin_token text,
  p_site_name text,
  p_tagline text,
  p_gallery_page_size integer,
  p_max_upload_mb integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._assert_admin_token(p_admin_token);

  UPDATE public.site_settings
  SET
    site_name = trim(p_site_name),
    tagline = trim(p_tagline),
    gallery_page_size = greatest(4, least(48, p_gallery_page_size)),
    max_upload_mb = greatest(1, least(8, p_max_upload_mb))
  WHERE id = 1;

  INSERT INTO public.activity_logs (user_id, event, metadata)
  VALUES (auth.uid(), 'settings_updated', jsonb_build_object('site_name', trim(p_site_name)));

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_change_password(
  p_admin_token text,
  p_old_password text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_stored_hash text;
BEGIN
  PERFORM public._assert_admin_token(p_admin_token);

  IF p_new_password IS NULL OR char_length(p_new_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
  END IF;

  SELECT password_hash INTO v_stored_hash FROM public.admin_settings WHERE id = 1;
  IF v_stored_hash IS NULL OR extensions.crypt(coalesce(p_old_password, ''), v_stored_hash) <> v_stored_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'পুরনো পাসওয়ার্ড সঠিক নয়।');
  END IF;

  UPDATE public.admin_settings
  SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10))
  WHERE id = 1;

  INSERT INTO public.activity_logs (user_id, event, metadata)
  VALUES (auth.uid(), 'admin_password_changed', '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Restrict execute permissions explicitly
REVOKE ALL ON FUNCTION public._assert_admin_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_client_activity(text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_login(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_data(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_photo(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_block_user(text, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_settings(text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_password(text, text, text) TO anon, authenticated;

-- 9. Supabase Storage Bucket & Policies
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Public read access for photos bucket" ON storage.objects;
CREATE POLICY "Public read access for photos bucket"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'photos');

DROP POLICY IF EXISTS "Authenticated active users upload to own folder" ON storage.objects;
CREATE POLICY "Authenticated active users upload to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_blocked = false
    )
  );

DROP POLICY IF EXISTS "Users can update own folder objects" ON storage.objects;
CREATE POLICY "Users can update own folder objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own folder objects" ON storage.objects;
CREATE POLICY "Users can delete own folder objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
