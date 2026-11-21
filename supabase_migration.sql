-- ============================================================================
-- STUDY BLUNDER — Complete Safe, Idempotent Supabase Schema & Migration
-- ============================================================================
-- Safe to run on both:
--   1. A brand-new Supabase project (creates all 14 tables + RLS policies)
--   2. An existing STUDY BLUNDER Supabase database (only adds missing columns)
-- Never deletes existing data. Never disables Row Level Security (RLS).
-- Run this once in the Supabase SQL Editor for your STUDY BLUNDER project.
-- ============================================================================

-- 1. app_users
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY,
  name text DEFAULT '',
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user',
  vip_active boolean NOT NULL DEFAULT false,
  vip_expires_at timestamptz,
  free_access_expires_at timestamptz,
  is_blocked boolean NOT NULL DEFAULT false,
  blocked_at timestamptz,
  blocked_reason text,
  blocked_by text,
  vip_bound_device_id text,
  vip_bound_session_id text,
  vip_device_label text,
  vip_device_bound_at timestamptz,
  vip_device_last_seen_at timestamptz,
  vip_device_last_ip text,
  vip_device_last_ua text,
  vip_device_reset_count integer DEFAULT 0,
  vip_device_last_reset_at timestamptz,
  vip_device_last_reset_by text,
  vip_sharing_attempt_count integer DEFAULT 0,
  vip_last_sharing_attempt_at timestamptz,
  referral_code text,
  referred_by_user_id uuid,
  referred_by_code text,
  referred_at timestamptz,
  bonus_vip_days integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  last_login_at timestamptz
);

ALTER TABLE IF EXISTS public.app_users
  ADD COLUMN IF NOT EXISTS name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_by text,
  ADD COLUMN IF NOT EXISTS vip_bound_device_id text,
  ADD COLUMN IF NOT EXISTS vip_bound_session_id text,
  ADD COLUMN IF NOT EXISTS vip_device_label text,
  ADD COLUMN IF NOT EXISTS vip_device_bound_at timestamptz,
  ADD COLUMN IF NOT EXISTS vip_device_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS vip_device_last_ip text,
  ADD COLUMN IF NOT EXISTS vip_device_last_ua text,
  ADD COLUMN IF NOT EXISTS vip_device_reset_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_device_last_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS vip_device_last_reset_by text,
  ADD COLUMN IF NOT EXISTS vip_sharing_attempt_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_last_sharing_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS referred_by_code text,
  ADD COLUMN IF NOT EXISTS referred_at timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_vip_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_allowed_platform_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vip_platform_expiries jsonb DEFAULT '{}'::jsonb;

-- 2. app_settings (singleton row id = 'global_config')
CREATE TABLE IF NOT EXISTS public.app_settings (
  id text PRIMARY KEY DEFAULT 'global_config',
  app_name text DEFAULT 'STUDY BLUNDER',
  app_logo_url text DEFAULT '',
  key_generation_enabled boolean DEFAULT true,
  shortener_url text DEFAULT '',
  tutorial_video_url text DEFAULT '',
  key_expiry_hours integer DEFAULT 24,
  free_access_duration numeric DEFAULT 24,
  free_access_unit text DEFAULT 'hours',
  telegram_channel_url text DEFAULT '',
  telegram_popup_enabled boolean DEFAULT true,
  telegram_popup_title text DEFAULT 'Join Telegram Channel',
  telegram_popup_message text DEFAULT '',
  telegram_popup_button_text text DEFAULT 'Join Channel',
  telegram_popup_close_text text DEFAULT 'Maybe Later',
  telegram_popup_reminder_text text DEFAULT 'Official Study Blunder Community',
  telegram_popup_frequency text DEFAULT 'once_per_session',
  telegram_popup_show_on_resume boolean DEFAULT false,
  maintenance_mode boolean DEFAULT false,
  login_enabled boolean DEFAULT true,
  vip_purchase_url text DEFAULT '',
  vip_telegram_url text DEFAULT '',
  vip_payment_qr_url text DEFAULT '',
  vip_payment_amount numeric DEFAULT 0,
  vip_payment_instructions text DEFAULT '',
  vip_payment_utr_required boolean DEFAULT false,
  vip_grace_period_hours integer DEFAULT 24,
  referral_reward_days integer DEFAULT 7,
  referral_program_enabled boolean DEFAULT true,
  referral_discount_config jsonb DEFAULT '{}'::jsonb,
  theme_primary text DEFAULT '#FF2525',
  theme_secondary text DEFAULT '#C90000',
  theme_background text DEFAULT '#090909',
  theme_text text DEFAULT '#F5F5F5',
  theme_button text DEFAULT '#FF2525',
  vip_theme_background text DEFAULT '#090909',
  vip_theme_card text DEFAULT '#1D1D1D',
  vip_theme_accent text DEFAULT '#FF2525',
  vip_theme_text text DEFAULT '#F5F5F5',
  vip_theme_button text DEFAULT '#FF2525',
  vip_theme_border text DEFAULT '#454545',
  announcement_slider_enabled boolean DEFAULT true,
  announcement_slide_interval_seconds integer DEFAULT 5,
  support_enabled boolean DEFAULT true,
  support_url text DEFAULT '',
  support_title text DEFAULT 'Contact Support',
  support_button_label text DEFAULT 'Contact Support',
  support_description text DEFAULT '',
  support_image_url text DEFAULT '',
  donation_enabled boolean DEFAULT false,
  donation_url text DEFAULT '',
  donation_button_text text DEFAULT 'Donate & Support Us',
  donation_title text DEFAULT 'Support Free Education',
  donation_message text DEFAULT '',
  donation_description text DEFAULT '',
  donation_qr_url text DEFAULT '',
  custom_popup_enabled boolean DEFAULT false,
  custom_popup_title text DEFAULT '',
  custom_popup_message text DEFAULT '',
  custom_popup_image_url text DEFAULT '',
  custom_popup_button_text text DEFAULT 'Learn More',
  custom_popup_button_url text DEFAULT '',
  custom_popup_close_text text DEFAULT 'Dismiss',
  custom_popup_start_date timestamptz,
  custom_popup_end_date timestamptz,
  custom_popup_frequency text DEFAULT 'once_per_session',
  data_retention_days integer DEFAULT 30,
  retention_login_history_days integer DEFAULT 30,
  retention_expired_keys_days integer DEFAULT 7,
  retention_failed_payments_days integer DEFAULT 30,
  festival_decorations_enabled boolean DEFAULT true,
  active_festival_id text,
  festival_configs_json jsonb,
  festival_version integer DEFAULT 1,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS public.app_settings
  ADD COLUMN IF NOT EXISTS app_name text DEFAULT 'STUDY BLUNDER',
  ADD COLUMN IF NOT EXISTS app_logo_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS key_generation_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS shortener_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tutorial_video_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS key_expiry_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS free_access_duration numeric DEFAULT 24,
  ADD COLUMN IF NOT EXISTS free_access_unit text DEFAULT 'hours',
  ADD COLUMN IF NOT EXISTS telegram_channel_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS telegram_popup_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS telegram_popup_title text DEFAULT 'Join Telegram Channel',
  ADD COLUMN IF NOT EXISTS telegram_popup_message text DEFAULT '',
  ADD COLUMN IF NOT EXISTS telegram_popup_button_text text DEFAULT 'Join Channel',
  ADD COLUMN IF NOT EXISTS telegram_popup_close_text text DEFAULT 'Maybe Later',
  ADD COLUMN IF NOT EXISTS telegram_popup_reminder_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS telegram_popup_frequency text DEFAULT 'once_per_session',
  ADD COLUMN IF NOT EXISTS telegram_popup_show_on_resume boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_mode boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS login_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS vip_purchase_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS vip_telegram_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS vip_payment_qr_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS vip_payment_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_payment_instructions text DEFAULT '',
  ADD COLUMN IF NOT EXISTS vip_payment_utr_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_grace_period_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS referral_reward_days integer DEFAULT 7,
  ADD COLUMN IF NOT EXISTS referral_program_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS referral_discount_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS theme_primary text DEFAULT '#FF2525',
  ADD COLUMN IF NOT EXISTS theme_secondary text DEFAULT '#C90000',
  ADD COLUMN IF NOT EXISTS theme_background text DEFAULT '#090909',
  ADD COLUMN IF NOT EXISTS theme_text text DEFAULT '#F5F5F5',
  ADD COLUMN IF NOT EXISTS theme_button text DEFAULT '#FF2525',
  ADD COLUMN IF NOT EXISTS vip_theme_background text DEFAULT '#090909',
  ADD COLUMN IF NOT EXISTS vip_theme_card text DEFAULT '#1D1D1D',
  ADD COLUMN IF NOT EXISTS vip_theme_accent text DEFAULT '#FF2525',
  ADD COLUMN IF NOT EXISTS vip_theme_text text DEFAULT '#F5F5F5',
  ADD COLUMN IF NOT EXISTS vip_theme_button text DEFAULT '#FF2525',
  ADD COLUMN IF NOT EXISTS vip_theme_border text DEFAULT '#454545',
  ADD COLUMN IF NOT EXISTS announcement_slider_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS announcement_slide_interval_seconds integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS support_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS support_title text DEFAULT 'Contact Support',
  ADD COLUMN IF NOT EXISTS support_button_label text DEFAULT 'Contact Support',
  ADD COLUMN IF NOT EXISTS support_description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS support_image_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS donation_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS donation_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS donation_button_text text DEFAULT 'Donate & Support Us',
  ADD COLUMN IF NOT EXISTS donation_title text DEFAULT 'Support Free Education',
  ADD COLUMN IF NOT EXISTS donation_message text DEFAULT '',
  ADD COLUMN IF NOT EXISTS donation_description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS donation_qr_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_popup_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_popup_title text DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_popup_message text DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_popup_image_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_popup_button_text text DEFAULT 'Learn More',
  ADD COLUMN IF NOT EXISTS custom_popup_button_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_popup_close_text text DEFAULT 'Dismiss',
  ADD COLUMN IF NOT EXISTS custom_popup_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS custom_popup_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS custom_popup_frequency text DEFAULT 'once_per_session',
  ADD COLUMN IF NOT EXISTS data_retention_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS retention_login_history_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS retention_expired_keys_days integer DEFAULT 7,
  ADD COLUMN IF NOT EXISTS retention_failed_payments_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS festival_decorations_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS active_festival_id text,
  ADD COLUMN IF NOT EXISTS festival_configs_json jsonb,
  ADD COLUMN IF NOT EXISTS festival_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS home_single_vip_label text DEFAULT 'VIP',
  ADD COLUMN IF NOT EXISTS home_single_vip_price numeric DEFAULT 49,
  ADD COLUMN IF NOT EXISTS home_single_vip_duration_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS home_single_vip_destination text DEFAULT 'in_app_single_vip',
  ADD COLUMN IF NOT EXISTS home_single_vip_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS home_all_vip_label text DEFAULT 'ALL VIP',
  ADD COLUMN IF NOT EXISTS home_all_vip_price numeric DEFAULT 149,
  ADD COLUMN IF NOT EXISTS home_all_vip_duration_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS home_all_vip_destination text DEFAULT 'in_app_all_vip',
  ADD COLUMN IF NOT EXISTS home_all_vip_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

INSERT INTO public.app_settings (id, app_name)
VALUES ('global_config', 'STUDY BLUNDER')
ON CONFLICT (id) DO NOTHING;

-- 3. platforms
CREATE TABLE IF NOT EXISTS public.platforms (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  category text DEFAULT 'General',
  logo_url text DEFAULT '',
  target_url text NOT NULL,
  access_type text NOT NULL DEFAULT 'normal',
  vip_target_url text DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  is_visible boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. vip_batches
CREATE TABLE IF NOT EXISTS public.vip_batches (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  category text DEFAULT 'VIP',
  logo_url text DEFAULT '',
  is_locked boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 5. vip_plans
CREATE TABLE IF NOT EXISTS public.vip_plans (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  plan_scope text NOT NULL DEFAULT 'all_platforms',
  price_inr numeric NOT NULL DEFAULT 0,
  original_price_inr numeric,
  duration_days integer NOT NULL DEFAULT 30,
  duration_months integer,
  bonus_days integer DEFAULT 0,
  discount_label text DEFAULT '',
  badge_label text DEFAULT '',
  description text DEFAULT '',
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS public.vip_plans
  ADD COLUMN IF NOT EXISTS plan_scope text DEFAULT 'all_platforms',
  ADD COLUMN IF NOT EXISTS original_price_inr numeric,
  ADD COLUMN IF NOT EXISTS bonus_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_label text DEFAULT '';

-- 6. announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  link_url text DEFAULT '',
  is_published boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS public.announcements
  ADD COLUMN IF NOT EXISTS content text DEFAULT '',
  ADD COLUMN IF NOT EXISTS link_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS end_date timestamptz;

-- 7. key_records
CREATE TABLE IF NOT EXISTS public.key_records (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  user_email text DEFAULT '',
  token text NOT NULL,
  shortener_url text DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- 8. login_history
CREATE TABLE IF NOT EXISTS public.login_history (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  email text NOT NULL,
  ip_address text DEFAULT '',
  user_agent text DEFAULT '',
  status text NOT NULL DEFAULT 'success',
  timestamp timestamptz DEFAULT now()
);

-- 9. payment_records
CREATE TABLE IF NOT EXISTS public.payment_records (
  id uuid PRIMARY KEY,
  request_id text,
  user_id text NOT NULL,
  user_email text DEFAULT '',
  plan_id text,
  plan_title text DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 30,
  bonus_days_applied integer DEFAULT 0,
  utr_number text DEFAULT '',
  screenshot_url text DEFAULT '',
  purchase_source text DEFAULT 'vip_tab',
  status text NOT NULL DEFAULT 'pending',
  admin_note text DEFAULT '',
  vip_scope text DEFAULT 'all_platforms',
  selected_platform_id text,
  selected_platform_name text,
  created_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  verified_by text
);

ALTER TABLE IF EXISTS public.payment_records
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS submitted_email text,
  ADD COLUMN IF NOT EXISTS plan_duration_days integer,
  ADD COLUMN IF NOT EXISTS expected_amount numeric,
  ADD COLUMN IF NOT EXISTS amount_mismatch boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'qr_verification',
  ADD COLUMN IF NOT EXISTS transaction_reference text,
  ADD COLUMN IF NOT EXISTS screenshot_storage_path text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS vip_scope text DEFAULT 'all_platforms',
  ADD COLUMN IF NOT EXISTS selected_platform_id text,
  ADD COLUMN IF NOT EXISTS selected_platform_name text;

-- 10. vip_device_logs
CREATE TABLE IF NOT EXISTS public.vip_device_logs (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  email text DEFAULT '',
  event_type text NOT NULL,
  attempted_device_id text,
  bound_device_id text,
  device_label text,
  ip_address text,
  user_agent text,
  reason text,
  timestamp timestamptz DEFAULT now()
);

-- 11. user_feedback
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  user_email text DEFAULT '',
  rating integer DEFAULT 5,
  category text DEFAULT 'general',
  message text NOT NULL DEFAULT '',
  status text DEFAULT 'new',
  admin_reply text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 12. platform_usage_logs
CREATE TABLE IF NOT EXISTS public.platform_usage_logs (
  id uuid PRIMARY KEY,
  platform_id text NOT NULL,
  user_id text NOT NULL,
  user_email text,
  opened_at timestamptz DEFAULT now()
);

-- 13. festival_decorations
CREATE TABLE IF NOT EXISTS public.festival_decorations (
  id text PRIMARY KEY,
  name text NOT NULL,
  is_enabled boolean DEFAULT false,
  config jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- 14. referral_discount_config
CREATE TABLE IF NOT EXISTS public.referral_discount_config (
  id text PRIMARY KEY DEFAULT 'referral_discount_config',
  discount_enabled boolean DEFAULT false,
  discount_type text DEFAULT 'percentage',
  discount_value numeric DEFAULT 0,
  min_purchase_amount numeric DEFAULT 0,
  max_discount_amount numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- Enable Row Level Security (RLS) on all tables (Backend uses SERVICE_ROLE_KEY)
-- ============================================================================
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_device_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_decorations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_discount_config ENABLE ROW LEVEL SECURITY;

-- Public read-only policies for non-sensitive catalog & config tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'Public read app_settings') THEN
    CREATE POLICY "Public read app_settings" ON public.app_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'platforms' AND policyname = 'Public read visible platforms') THEN
    CREATE POLICY "Public read visible platforms" ON public.platforms FOR SELECT USING (is_visible = true AND status = 'active');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vip_plans' AND policyname = 'Public read active vip_plans') THEN
    CREATE POLICY "Public read active vip_plans" ON public.vip_plans FOR SELECT USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vip_batches' AND policyname = 'Public read vip_batches') THEN
    CREATE POLICY "Public read vip_batches" ON public.vip_batches FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'announcements' AND policyname = 'Public read active announcements') THEN
    CREATE POLICY "Public read active announcements" ON public.announcements FOR SELECT USING (is_published = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'festival_decorations' AND policyname = 'Public read festival_decorations') THEN
    CREATE POLICY "Public read festival_decorations" ON public.festival_decorations FOR SELECT USING (true);
  END IF;
END $$;

-- Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
