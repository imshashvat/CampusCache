-- ============================================================
-- CampusCache — Complete Database Setup Script (Safe/Idempotent)
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run even if some objects already exist
-- ============================================================

-- ===== ENUMS (safe re-run) =====
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.file_type AS ENUM ('notes', 'ppt', 'assignment', 'lab', 'pyq', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ===== PROFILES =====
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  branch TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update their own profile" ON public.profiles;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);


-- ===== USER ROLES =====
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

DROP POLICY IF EXISTS "User roles viewable by everyone" ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;

CREATE POLICY "User roles viewable by everyone"
  ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- ===== RESOURCES =====
CREATE TABLE IF NOT EXISTS public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  file_type file_type NOT NULL,
  branch TEXT NOT NULL,
  year INTEGER NOT NULL,
  semester INTEGER NOT NULL,
  subject TEXT,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_admin_upload BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_resources_branch_year_sem ON public.resources(branch, year, semester);
CREATE INDEX IF NOT EXISTS idx_resources_file_type ON public.resources(file_type);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON public.resources(created_at DESC);

DROP POLICY IF EXISTS "Resources are viewable by everyone" ON public.resources;
DROP POLICY IF EXISTS "Authenticated users can upload" ON public.resources;
DROP POLICY IF EXISTS "Users update own resources, admins update any" ON public.resources;
DROP POLICY IF EXISTS "Users delete own resources, admins delete any" ON public.resources;

CREATE POLICY "Resources are viewable by everyone"
  ON public.resources FOR SELECT USING (true);
CREATE POLICY "Authenticated users can upload"
  ON public.resources FOR INSERT WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Users update own resources, admins update any"
  ON public.resources FOR UPDATE
  USING (auth.uid() = uploaded_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users delete own resources, admins delete any"
  ON public.resources FOR DELETE
  USING (auth.uid() = uploaded_by OR public.has_role(auth.uid(), 'admin'));


-- ===== DOWNLOADS =====
CREATE TABLE IF NOT EXISTS public.downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_downloads_resource ON public.downloads(resource_id);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON public.downloads(created_at DESC);

DROP POLICY IF EXISTS "Anyone can record downloads" ON public.downloads;
DROP POLICY IF EXISTS "Admins view downloads" ON public.downloads;

CREATE POLICY "Anyone can record downloads"
  ON public.downloads FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins view downloads"
  ON public.downloads FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));


-- ===== TRIGGERS =====
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated ON public.profiles;
DROP TRIGGER IF EXISTS set_resources_updated ON public.resources;

CREATE TRIGGER set_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_resources_updated BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ===== AUTO-CREATE PROFILE + ADMIN LOGIC ON SIGNUP =====
-- shashvatt68@gmail.com → automatically gets admin role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  IF lower(NEW.email) = 'shashvatt68@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ===== INCREMENT DOWNLOAD COUNT =====
CREATE OR REPLACE FUNCTION public.increment_download_count(_resource_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.resources SET download_count = download_count + 1 WHERE id = _resource_id;
  INSERT INTO public.downloads (resource_id, user_id) VALUES (_resource_id, auth.uid());
END;
$$;


-- ===== STORAGE BUCKET =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('resources', 'resources', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Resources publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload resources" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own files, admins delete any" ON storage.objects;

CREATE POLICY "Resources publicly readable"
  ON storage.objects FOR SELECT USING (bucket_id = 'resources');
CREATE POLICY "Authenticated can upload resources"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'resources' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users delete own files, admins delete any"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'resources' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- ============================================================
-- SUCCESS! Next steps:
-- 1. Authentication → URL Configuration
--    Site URL: https://campus-cache.vercel.app
--    Redirect URLs: https://campus-cache.vercel.app/**
-- 2. Project Settings → API → copy URL + anon key → update .env
-- ============================================================
