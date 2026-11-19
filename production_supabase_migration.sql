-- ==============================================================================
-- STUDY FOX: PRODUCTION DATABASE MIGRATION SCRIPT
-- Target Platform: Supabase PostgreSQL
-- Migration Type: Idempotent & Non-Destructive
-- Purpose: Provision or upgrade STUDY FOX tables, constraints, RLS policies,
--          storage buckets, and Super Admin verification without dropping data.
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. Core Tables Setup (10 Required Platform Tables)
-- ==============================================================================

-- 2.1 Platforms Table (Home Section Portals)
CREATE TABLE IF NOT EXISTS platforms (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    logo_url TEXT,
    target_url TEXT NOT NULL,
    access_type TEXT NOT NULL DEFAULT 'normal' CHECK (access_type IN ('normal', 'vip')),
    vip_target_url TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    is_visible BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$ BEGIN ALTER TABLE platforms ALTER COLUMN id TYPE TEXT USING id::text; EXCEPTION WHEN OTHERS THEN NULL; END $$;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS vip_target_url TEXT DEFAULT '';
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS access_type TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_platforms_visible_order ON platforms(is_visible, display_order);

-- 2.2 VIP Batches Table
CREATE TABLE IF NOT EXISTS vip_batches (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    logo_url TEXT,
    is_locked BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$ BEGIN ALTER TABLE vip_batches ALTER COLUMN id TYPE TEXT USING id::text; EXCEPTION WHEN OTHERS THEN NULL; END $$;
ALTER TABLE vip_batches ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_vip_batches_order ON vip_batches(display_order);

-- 2.3 VIP Plans Table
CREATE TABLE IF NOT EXISTS vip_plans (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    title TEXT NOT NULL,
    price_inr NUMERIC NOT NULL DEFAULT 299,
    duration_days INTEGER NOT NULL DEFAULT 365,
    duration_months INTEGER DEFAULT 12,
    badge_label TEXT DEFAULT 'BEST VALUE',
    description TEXT DEFAULT 'Premium VIP Access',
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$ BEGIN ALTER TABLE vip_plans ALTER COLUMN id TYPE TEXT USING id::text; EXCEPTION WHEN OTHERS THEN NULL; END $$;
ALTER TABLE vip_plans ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 365;
ALTER TABLE vip_plans ADD COLUMN IF NOT EXISTS badge_label TEXT DEFAULT 'BEST VALUE';
ALTER TABLE vip_plans ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vip_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_vip_plans_active_order ON vip_plans(is_active, display_order);

-- 2.4 Application Users Table (RBAC, Single-Device VIP Tracking, and Account Blocking)
CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT DEFAULT '',
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
    vip_active BOOLEAN NOT NULL DEFAULT false,
    vip_expires_at TIMESTAMP WITH TIME ZONE,
    free_access_expires_at TIMESTAMP WITH TIME ZONE,
    is_blocked BOOLEAN NOT NULL DEFAULT false,
    blocked_at TIMESTAMP WITH TIME ZONE,
    blocked_reason TEXT,
    blocked_by TEXT,
    vip_bound_device_id TEXT,
    vip_bound_session_id TEXT,
    vip_device_label TEXT,
    vip_device_bound_at TIMESTAMP WITH TIME ZONE,
    vip_device_last_seen_at TIMESTAMP WITH TIME ZONE,
    vip_device_last_ip TEXT,
    vip_device_last_ua TEXT,
    vip_device_reset_count INTEGER NOT NULL DEFAULT 0,
    vip_device_last_reset_at TIMESTAMP WITH TIME ZONE,
    vip_device_last_reset_by TEXT,
    vip_sharing_attempt_count INTEGER NOT NULL DEFAULT 0,
    vip_last_sharing_attempt_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE
);

DO $$ BEGIN ALTER TABLE app_users ALTER COLUMN id TYPE TEXT USING id::text; EXCEPTION WHEN OTHERS THEN NULL; END $$;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS blocked_by TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS free_access_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_bound_device_id TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_bound_session_id TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_device_label TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_device_bound_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_device_last_seen_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_device_last_ip TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_device_last_ua TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_device_reset_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_device_last_reset_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_device_last_reset_by TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_sharing_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_last_sharing_attempt_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(lower(email));
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_is_blocked ON app_users(is_blocked);
CREATE INDEX IF NOT EXISTS idx_app_users_vip_device ON app_users(vip_bound_device_id);

-- 2.5 Application Settings Table (Portal Configuration, Appearance, Retention & QR)
CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY DEFAULT 'global_config',
    key_generation_enabled BOOLEAN NOT NULL DEFAULT true,
    shortener_url TEXT NOT NULL DEFAULT 'https://shrinkme.io/example',
    tutorial_video_url TEXT NOT NULL DEFAULT 'https://youtube.com',
    telegram_channel_url TEXT NOT NULL DEFAULT 'https://t.me/education_hub_updates',
    telegram_popup_enabled BOOLEAN NOT NULL DEFAULT true,
    telegram_popup_title TEXT DEFAULT 'Join Telegram Channel',
    telegram_popup_message TEXT DEFAULT 'Get instant updates on new batches, free access keys, and announcements.',
    telegram_popup_button_text TEXT DEFAULT 'Join Channel',
    telegram_popup_close_text TEXT DEFAULT 'Maybe Later',
    telegram_popup_reminder_text TEXT DEFAULT '',
    telegram_popup_frequency TEXT NOT NULL DEFAULT 'once_per_session' CHECK (telegram_popup_frequency IN ('every_launch', 'every_visit', 'once_per_session', 'once_per_day', 'once_per_user', 'disabled')),
    telegram_popup_show_on_resume BOOLEAN NOT NULL DEFAULT false,
    maintenance_mode BOOLEAN NOT NULL DEFAULT false,
    login_enabled BOOLEAN NOT NULL DEFAULT true,
    key_expiry_hours INTEGER NOT NULL DEFAULT 24,
    free_access_duration INTEGER NOT NULL DEFAULT 24,
    free_access_unit TEXT NOT NULL DEFAULT 'hours' CHECK (free_access_unit IN ('minutes', 'hours', 'days')),
    vip_purchase_url TEXT DEFAULT '',
    vip_telegram_url TEXT DEFAULT '',
    vip_payment_qr_url TEXT DEFAULT '',
    vip_payment_amount NUMERIC NOT NULL DEFAULT 299,
    vip_payment_instructions TEXT DEFAULT '',
    vip_payment_utr_required BOOLEAN NOT NULL DEFAULT false,
    app_name TEXT DEFAULT 'Education Platform',
    app_logo_url TEXT DEFAULT '',
    theme_primary TEXT DEFAULT '#6366f1',
    theme_secondary TEXT DEFAULT '#8b5cf6',
    theme_background TEXT DEFAULT '#070B14',
    theme_text TEXT DEFAULT '#f8fafc',
    theme_button TEXT DEFAULT '#4f46e5',
    vip_theme_background TEXT DEFAULT '#090d16',
    vip_theme_card TEXT DEFAULT '#0f172a',
    vip_theme_accent TEXT DEFAULT '#f59e0b',
    vip_theme_text TEXT DEFAULT '#f8fafc',
    vip_theme_button TEXT DEFAULT '#eab308',
    vip_theme_border TEXT DEFAULT '#1e293b',
    announcement_slider_enabled BOOLEAN NOT NULL DEFAULT true,
    announcement_slide_interval_seconds INTEGER NOT NULL DEFAULT 5 CHECK (announcement_slide_interval_seconds BETWEEN 2 AND 60),
    support_enabled BOOLEAN NOT NULL DEFAULT true,
    support_url TEXT DEFAULT '',
    support_title TEXT DEFAULT 'Support / Help',
    support_button_label TEXT DEFAULT 'Contact Support',
    support_description TEXT DEFAULT '',
    support_image_url TEXT DEFAULT '',
    donation_enabled BOOLEAN NOT NULL DEFAULT false,
    donation_url TEXT DEFAULT '',
    donation_button_text TEXT DEFAULT 'Donate & Support Us',
    donation_title TEXT DEFAULT 'Support Free Education',
    donation_message TEXT DEFAULT '',
    donation_description TEXT DEFAULT '',
    donation_qr_url TEXT DEFAULT '',
    custom_popup_enabled BOOLEAN NOT NULL DEFAULT false,
    custom_popup_title TEXT DEFAULT '',
    custom_popup_message TEXT DEFAULT '',
    custom_popup_image_url TEXT DEFAULT '',
    custom_popup_button_text TEXT DEFAULT 'Learn More',
    custom_popup_button_url TEXT DEFAULT '',
    custom_popup_close_text TEXT DEFAULT 'Dismiss',
    custom_popup_start_date TIMESTAMP WITH TIME ZONE,
    custom_popup_end_date TIMESTAMP WITH TIME ZONE,
    custom_popup_frequency TEXT NOT NULL DEFAULT 'once_per_session' CHECK (custom_popup_frequency IN ('every_launch', 'every_visit', 'once_per_session', 'once_per_day', 'once_per_user', 'disabled')),
    data_retention_days INTEGER NOT NULL DEFAULT 30,
    retention_login_history_days INTEGER NOT NULL DEFAULT 30,
    retention_expired_keys_days INTEGER NOT NULL DEFAULT 30,
    retention_failed_payments_days INTEGER NOT NULL DEFAULT 90,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Idempotent column additions for existing installations
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS free_access_duration INTEGER NOT NULL DEFAULT 24;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS free_access_unit TEXT NOT NULL DEFAULT 'hours';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS telegram_popup_frequency TEXT NOT NULL DEFAULT 'once_per_session';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS vip_telegram_url TEXT DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS vip_payment_qr_url TEXT DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS vip_payment_amount NUMERIC DEFAULT 299;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS vip_payment_instructions TEXT DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS vip_payment_utr_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS support_title TEXT DEFAULT 'Support / Help';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS support_image_url TEXT DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS donation_message TEXT DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS retention_login_history_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS retention_expired_keys_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS retention_failed_payments_days INTEGER NOT NULL DEFAULT 90;

DO $$
BEGIN
    ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_custom_popup_frequency_check;
    ALTER TABLE app_settings ADD CONSTRAINT app_settings_custom_popup_frequency_check
        CHECK (custom_popup_frequency IN ('every_launch', 'every_visit', 'once_per_session', 'once_per_day', 'once_per_user', 'disabled'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2.6 Announcements Table
CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    link_url TEXT DEFAULT '',
    is_published BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 1,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$ BEGIN ALTER TABLE announcements ALTER COLUMN id TYPE TEXT USING id::text; EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_announcements_published_order ON announcements(is_published, display_order);

-- 2.7 Login History Audit Table
CREATE TABLE IF NOT EXISTS login_history (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'DEVICE_MISMATCH_BLOCKED', 'DEVICE_RESET_BY_ADMIN')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$ BEGIN ALTER TABLE login_history ALTER COLUMN id TYPE TEXT USING id::text; EXCEPTION WHEN OTHERS THEN NULL; END $$;
ALTER TABLE login_history DROP CONSTRAINT IF EXISTS login_history_status_check;
ALTER TABLE login_history ADD CONSTRAINT login_history_status_check
    CHECK (status IN ('success', 'failed', 'DEVICE_MISMATCH_BLOCKED', 'DEVICE_RESET_BY_ADMIN'));
CREATE INDEX IF NOT EXISTS idx_login_history_timestamp ON login_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);

-- 2.8 Payment Records Table (Audit & Verification)
CREATE TABLE IF NOT EXISTS payment_records (
    id TEXT PRIMARY KEY DEFAULT ('pay_' || to_char(now(), 'YYYYMMDDHH24MISS') || '_' || substr(md5(random()::text), 1, 6)),
    user_id TEXT,
    email TEXT NOT NULL,
    submitted_email TEXT,
    plan_id TEXT,
    plan_title TEXT NOT NULL DEFAULT 'Manual VIP Subscription',
    plan_duration_days INTEGER,
    amount NUMERIC(10, 2) NOT NULL,
    expected_amount NUMERIC(10, 2),
    amount_mismatch BOOLEAN DEFAULT false,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pending_verification', 'approved', 'completed', 'failed', 'rejected')),
    payment_method TEXT DEFAULT 'qr_verification',
    transaction_reference TEXT NOT NULL,
    screenshot_url TEXT,
    screenshot_storage_path TEXT,
    admin_note TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE payment_records DROP CONSTRAINT IF EXISTS payment_records_status_check;
ALTER TABLE payment_records ADD CONSTRAINT payment_records_status_check
    CHECK (status IN ('pending', 'pending_verification', 'approved', 'completed', 'failed', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_payment_records_status ON payment_records(status);
CREATE INDEX IF NOT EXISTS idx_payment_records_email ON payment_records(lower(email));
CREATE INDEX IF NOT EXISTS idx_payment_records_created ON payment_records(created_at DESC);

-- 2.9 Key Records Table (Access Tokens)
CREATE TABLE IF NOT EXISTS key_records (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    token TEXT,
    shortener_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

DO $$ BEGIN ALTER TABLE key_records ALTER COLUMN id TYPE TEXT USING id::text; EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_key_records_status_expires ON key_records(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_key_records_user ON key_records(user_id);

-- 2.10 VIP Device Security Audit Logs Table
CREATE TABLE IF NOT EXISTS vip_device_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('device_bound', 'device_mismatch_blocked', 'device_reset_by_admin', 'vip_session_replaced', 'vip_activated')),
    attempted_device_id TEXT NOT NULL,
    bound_device_id TEXT,
    device_label TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    admin_id TEXT,
    reason TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$ BEGIN ALTER TABLE vip_device_logs ALTER COLUMN id TYPE TEXT USING id::text; EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_vip_device_logs_user ON vip_device_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_vip_device_logs_timestamp ON vip_device_logs(timestamp DESC);

-- 2.11 Platform Usage Logs Table (Platform Opens Analytics)
CREATE TABLE IF NOT EXISTS platform_usage_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    platform_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_email TEXT,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$ BEGIN ALTER TABLE platform_usage_logs ALTER COLUMN id TYPE TEXT USING id::text; EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_platform_usage_logs_platform_ts ON platform_usage_logs(platform_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_usage_logs_ts ON platform_usage_logs(opened_at DESC);

-- 2.12 User Feedback Table (VIP & Non-VIP Student Feedback System)
CREATE TABLE IF NOT EXISTS user_feedback (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    is_vip_at_submission BOOLEAN NOT NULL DEFAULT false,
    category TEXT NOT NULL CHECK (category IN (
        'General Feedback',
        'Bug Report',
        'Platform Issue',
        'VIP Membership',
        'Payment Issue',
        'Feature Request',
        'Other'
    )),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    message TEXT NOT NULL,
    attachment_url TEXT DEFAULT NULL,
    attachment_storage_path TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In Review', 'Resolved', 'Rejected')),
    admin_note TEXT DEFAULT NULL,
    reviewed_by TEXT DEFAULT NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);

-- ==============================================================================
-- 3. Row Level Security (RLS) Enablement
-- ==============================================================================
ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_device_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: Never allow public reads of password_hash
REVOKE SELECT (password_hash) ON TABLE app_users FROM anon, authenticated;

-- ==============================================================================
-- 4. RLS Access Policies
-- ==============================================================================

-- Platforms
DROP POLICY IF EXISTS "Public can view active platforms" ON platforms;
CREATE POLICY "Public can view active platforms" ON platforms FOR SELECT USING (is_visible = true);

DROP POLICY IF EXISTS "Admins can manage platforms" ON platforms;
CREATE POLICY "Admins can manage platforms" ON platforms
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

-- VIP Batches
DROP POLICY IF EXISTS "Public can view VIP batches" ON vip_batches;
CREATE POLICY "Public can view VIP batches" ON vip_batches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage VIP batches" ON vip_batches;
CREATE POLICY "Admins can manage VIP batches" ON vip_batches
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

-- VIP Plans
DROP POLICY IF EXISTS "Public can view active VIP plans" ON vip_plans;
CREATE POLICY "Public can view active VIP plans" ON vip_plans FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage VIP plans" ON vip_plans;
CREATE POLICY "Admins can manage VIP plans" ON vip_plans
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

-- Announcements
DROP POLICY IF EXISTS "Public can view published announcements" ON announcements;
CREATE POLICY "Public can view published announcements" ON announcements FOR SELECT USING (is_published = true);

DROP POLICY IF EXISTS "Admins can manage announcements" ON announcements;
CREATE POLICY "Admins can manage announcements" ON announcements
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

-- App Settings (Public read; Admins have INSERT and UPDATE for upserts)
DROP POLICY IF EXISTS "Public can view application settings" ON app_settings;
CREATE POLICY "Public can view application settings" ON app_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can update application settings" ON app_settings;
CREATE POLICY "Admins can update application settings" ON app_settings
    FOR UPDATE USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "Admins can insert application settings" ON app_settings;
CREATE POLICY "Admins can insert application settings" ON app_settings
    FOR INSERT WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

-- Payment Records (Users see own claims; Admins manage all; Public read forbidden)
DROP POLICY IF EXISTS "Users can view own payment claims and Admins can view all payment records" ON payment_records;
CREATE POLICY "Users can view own payment claims and Admins can view all payment records" ON payment_records
    FOR SELECT USING (
        auth.uid()::text = user_id
        OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
    );

DROP POLICY IF EXISTS "Authenticated users can submit pending verification payment claims" ON payment_records;
CREATE POLICY "Authenticated users can submit pending verification payment claims" ON payment_records
    FOR INSERT WITH CHECK (
        (auth.uid()::text = user_id OR auth.uid() IS NOT NULL)
        AND status IN ('pending', 'pending_verification')
        AND amount > 0
    );

DROP POLICY IF EXISTS "Admins can update payment verification status" ON payment_records;
CREATE POLICY "Admins can update payment verification status" ON payment_records
    FOR UPDATE USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "Admins can delete non-completed payment records" ON payment_records;
CREATE POLICY "Admins can delete non-completed payment records" ON payment_records
    FOR DELETE USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
        AND status <> 'completed'
    );

-- Audit & Security Tables (Admins Only)
DROP POLICY IF EXISTS "Admins can view and clean login history" ON login_history;
CREATE POLICY "Admins can view and clean login history" ON login_history
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "Admins can manage key records" ON key_records;
CREATE POLICY "Admins can manage key records" ON key_records
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "Admins can manage VIP device logs" ON vip_device_logs;
CREATE POLICY "Admins can manage VIP device logs" ON vip_device_logs
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "Admins can view and manage platform usage logs" ON platform_usage_logs;
CREATE POLICY "Admins can view and manage platform usage logs" ON platform_usage_logs
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "Authenticated users can insert own platform usage logs" ON platform_usage_logs;
CREATE POLICY "Authenticated users can insert own platform usage logs" ON platform_usage_logs
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- User Feedback Policies
DROP POLICY IF EXISTS "user_feedback_insert_own" ON user_feedback;
CREATE POLICY "user_feedback_insert_own" ON user_feedback
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "user_feedback_select_own_or_admin" ON user_feedback;
CREATE POLICY "user_feedback_select_own_or_admin" ON user_feedback
    FOR SELECT TO authenticated
    USING (
        auth.uid()::text = user_id
        OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
    );

DROP POLICY IF EXISTS "user_feedback_admin_update" ON user_feedback;
CREATE POLICY "user_feedback_admin_update" ON user_feedback
    FOR UPDATE TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'))
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "user_feedback_admin_delete" ON user_feedback;
CREATE POLICY "user_feedback_admin_delete" ON user_feedback
    FOR DELETE TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin'));

-- Users Table Policies
DROP POLICY IF EXISTS "Users can view own profile" ON app_users;
CREATE POLICY "Users can view own profile" ON app_users
    FOR SELECT USING (
        auth.uid() = id
        OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
    );

DROP POLICY IF EXISTS "Super Admin can insert user roles and accounts" ON app_users;
CREATE POLICY "Super Admin can insert user roles and accounts" ON app_users
    FOR INSERT WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

DROP POLICY IF EXISTS "Super Admin can update user roles and accounts" ON app_users;
CREATE POLICY "Super Admin can update user roles and accounts" ON app_users
    FOR UPDATE USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

-- ==============================================================================
-- 5. Storage Buckets & Policies (App Assets, Payment Screenshots & Feedback)
-- ==============================================================================

-- 5.1 Public Asset Bucket (Logos & UI Banners)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'app-assets',
    'app-assets',
    true,
    5242880,
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];

-- 5.2 Private Financial Proof Bucket (Strictly Private - Public Access FORBIDDEN)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-screenshots',
    'payment-screenshots',
    false, -- Strictly Private
    5242880,
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- 5.3 Private Feedback Attachments Bucket (5MB limit, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'feedback-attachments',
    'feedback-attachments',
    false,
    5242880,
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- Storage Object Policies
DROP POLICY IF EXISTS "Public Read Access for app-assets" ON storage.objects;
CREATE POLICY "Public Read Access for app-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-assets');

DROP POLICY IF EXISTS "Admin Upload Access for app-assets" ON storage.objects;
CREATE POLICY "Admin Upload Access for app-assets"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'app-assets'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
);

DROP POLICY IF EXISTS "Public Read Access for payment-screenshots" ON storage.objects;

DROP POLICY IF EXISTS "Admins can view payment screenshots" ON storage.objects;
CREATE POLICY "Admins can view payment screenshots"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'payment-screenshots'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
);

DROP POLICY IF EXISTS "Admins can view feedback attachments" ON storage.objects;
CREATE POLICY "Admins can view feedback attachments"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'feedback-attachments'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
);

-- ==============================================================================
-- 6. Super Admin & Initial System Records (Non-Destructive)
-- ==============================================================================

-- Seed default settings without overwriting customized configuration
INSERT INTO app_settings (id, key_generation_enabled, shortener_url, tutorial_video_url, telegram_channel_url, telegram_popup_enabled, maintenance_mode, login_enabled, key_expiry_hours)
VALUES (
    'global_config',
    true,
    'https://shrinkme.io/example',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://t.me/education_hub_updates',
    true,
    false,
    true,
    24
) ON CONFLICT (id) DO NOTHING;

-- Establish the intended Super Admin account record safely
INSERT INTO app_users (
    id,
    email,
    password_hash,
    role,
    vip_active,
    vip_expires_at,
    created_at
)
VALUES (
    '27f86505-bb19-465f-9597-aecf7ec7ee85',
    'bhaskardattmishra0101@gmail.com',
    'SUPABASE_AUTH_MANAGED',
    'super_admin',
    true,
    timezone('utc'::text, now()) + interval '10 years',
    timezone('utc'::text, now())
)
ON CONFLICT (email) DO UPDATE SET
    role = 'super_admin',
    vip_active = true;

-- ==============================================================================
-- 7. MASTER UPGRADE (PARTS 1–4): PRE-KEY VIP, ADMIN CONTROL, VIP FEATURE
--    MANAGEMENT, 14 VIP STUDENT FEATURES, SMART NOTIFICATIONS, AUDIT & BACKUPS
-- ==============================================================================

ALTER TABLE vip_plans ADD COLUMN IF NOT EXISTS original_price_inr NUMERIC DEFAULT NULL;
ALTER TABLE vip_plans ADD COLUMN IF NOT EXISTS bonus_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vip_plans ADD COLUMN IF NOT EXISTS discount_label TEXT DEFAULT '';

ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS purchase_source TEXT DEFAULT 'in_app';
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS bonus_days_applied INTEGER DEFAULT 0;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_payment_records_request_id ON payment_records(request_id);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referred_by_user_id TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referral_bonus_days_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS vip_grace_until TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_app_users_referral_code ON app_users(referral_code);

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS vip_grace_period_hours INTEGER NOT NULL DEFAULT 24;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS referral_reward_days INTEGER NOT NULL DEFAULT 7;

CREATE TABLE IF NOT EXISTS admin_permissions (
    admin_user_id TEXT NOT NULL,
    section_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    can_view BOOLEAN NOT NULL DEFAULT false,
    can_add BOOLEAN NOT NULL DEFAULT false,
    can_edit BOOLEAN NOT NULL DEFAULT false,
    can_delete BOOLEAN NOT NULL DEFAULT false,
    can_approve BOOLEAN NOT NULL DEFAULT false,
    can_reject BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by TEXT,
    PRIMARY KEY (admin_user_id, section_key)
);

CREATE TABLE IF NOT EXISTS admin_permission_history (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    target_admin_id TEXT NOT NULL,
    target_admin_email TEXT NOT NULL,
    changed_by_id TEXT NOT NULL,
    changed_by_email TEXT NOT NULL,
    change_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    previous_permissions JSONB,
    new_permissions JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS vip_feature_settings (
    id TEXT PRIMARY KEY DEFAULT 'vip_feature_config',
    global_master_enabled BOOLEAN NOT NULL DEFAULT true,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by TEXT
);

CREATE TABLE IF NOT EXISTS study_streaks (
    user_id TEXT PRIMARY KEY,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    total_study_days INTEGER NOT NULL DEFAULT 0,
    last_activity_date_ist TEXT,
    activity_dates_ist JSONB NOT NULL DEFAULT '[]'::jsonb,
    milestone_7_unlocked BOOLEAN NOT NULL DEFAULT false,
    milestone_30_unlocked BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_records (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT 'General',
    exam_date TEXT NOT NULL,
    target_score TEXT,
    notes TEXT,
    is_global BOOLEAN NOT NULL DEFAULT false,
    is_published BOOLEAN NOT NULL DEFAULT true,
    owner_user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_library_resources (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    external_url TEXT,
    is_exclusive BOOLEAN NOT NULL DEFAULT false,
    is_published BOOLEAN NOT NULL DEFAULT true,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS vip_exclusive_announcements (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'exclusive_update',
    badge_text TEXT,
    action_url TEXT,
    action_label TEXT,
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS study_timetables (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL,
    day_of_week TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    target_minutes INTEGER NOT NULL DEFAULT 60,
    completed_today BOOLEAN NOT NULL DEFAULT false,
    last_completed_date_ist TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS vip_mock_tests (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 15,
    total_marks INTEGER NOT NULL DEFAULT 12,
    difficulty TEXT NOT NULL DEFAULT 'Medium',
    is_published BOOLEAN NOT NULL DEFAULT true,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS vip_mock_test_attempts (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    test_id TEXT NOT NULL,
    test_title TEXT NOT NULL,
    user_id TEXT NOT NULL,
    score NUMERIC NOT NULL,
    total_marks NUMERIC NOT NULL,
    correct_count INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    accuracy_percent INTEGER NOT NULL,
    time_taken_seconds INTEGER NOT NULL,
    answers JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS priority_support_tickets (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'high',
    status TEXT NOT NULL DEFAULT 'open',
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_records (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    referrer_user_id TEXT NOT NULL,
    referrer_email TEXT NOT NULL,
    referred_user_id TEXT NOT NULL UNIQUE,
    referred_email TEXT NOT NULL,
    referral_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_verification',
    reward_days_granted INTEGER NOT NULL DEFAULT 0,
    fraud_flag_reason TEXT,
    ip_address TEXT,
    device_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    qualified_at TIMESTAMP WITH TIME ZONE,
    rewarded_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS smart_notifications (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_tab TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    dedupe_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    actor_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    section TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_label TEXT NOT NULL,
    details_summary TEXT NOT NULL,
    previous_value JSONB,
    new_value JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS database_backups (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by_email TEXT NOT NULL,
    label TEXT NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    table_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_permission_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_feature_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_library_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_exclusive_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_mock_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_mock_test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE priority_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE database_backups ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 8. ADDITIONAL MASTER UPDATE (PARTS A–M): VIP DASHBOARD REORDERING,
--    REFERRAL MANAGEMENT, REFERRAL DISCOUNTS & SALES TRACKING
-- ==============================================================================

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS referral_program_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS original_price_inr NUMERIC(10, 2);
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS referral_code_applied TEXT;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS referrer_user_id TEXT;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS referral_discount_applied NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS final_payable_amount NUMERIC(10, 2);
CREATE INDEX IF NOT EXISTS idx_payment_records_referrer_user_id ON payment_records(referrer_user_id);

ALTER TABLE referral_records ADD COLUMN IF NOT EXISTS referrer_role TEXT DEFAULT 'user';
ALTER TABLE referral_records ADD COLUMN IF NOT EXISTS login_completed BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE referral_records ADD COLUMN IF NOT EXISTS vip_purchased BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE referral_records ADD COLUMN IF NOT EXISTS vip_plan_purchased TEXT;
ALTER TABLE referral_records ADD COLUMN IF NOT EXISTS original_plan_price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE referral_records ADD COLUMN IF NOT EXISTS referral_discount_applied NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE referral_records ADD COLUMN IF NOT EXISTS final_paid_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE referral_records ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE referral_records ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'none';
ALTER TABLE referral_records ADD COLUMN IF NOT EXISTS reward_status TEXT DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS referral_user_permissions (
    user_id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    user_role TEXT NOT NULL DEFAULT 'user',
    can_access_referral_dashboard BOOLEAN NOT NULL DEFAULT true,
    can_view_own_referral_data BOOLEAN NOT NULL DEFAULT true,
    can_view_referral_sales BOOLEAN NOT NULL DEFAULT true,
    can_create_share_referral_link BOOLEAN NOT NULL DEFAULT true,
    can_manage_referral_settings BOOLEAN NOT NULL DEFAULT false,
    can_view_referral_reports BOOLEAN NOT NULL DEFAULT false,
    can_access_referral_management BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by TEXT
);

CREATE TABLE IF NOT EXISTS referral_discount_config (
    id TEXT PRIMARY KEY DEFAULT 'referral_discount_config',
    discount_enabled BOOLEAN NOT NULL DEFAULT true,
    discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed', 'none')),
    discount_value NUMERIC(10, 2) NOT NULL DEFAULT 10,
    min_purchase_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 500,
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    usage_limit_per_user INTEGER NOT NULL DEFAULT 1,
    combine_with_plan_discount BOOLEAN NOT NULL DEFAULT true,
    campaign_label TEXT NOT NULL DEFAULT 'Referral Special Discount',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by TEXT
);

ALTER TABLE referral_user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_discount_config ENABLE ROW LEVEL SECURITY;


