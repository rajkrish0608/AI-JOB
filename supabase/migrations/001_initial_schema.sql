-- ============================================================================
-- AI Job Apply — Initial Database Schema
-- Migration: 001_initial_schema.sql
-- Description: All core tables, indexes, RLS policies, and storage buckets
-- ============================================================================

-- ============================================================================
-- 0. CLEANUP (Optional: for fresh starts)
-- ============================================================================
DROP VIEW IF EXISTS public.daily_application_counts;
DROP VIEW IF EXISTS public.user_application_stats;
DROP TABLE IF EXISTS public.applications;
DROP TABLE IF EXISTS public.generated_resumes;
DROP TABLE IF EXISTS public.dream_companies;
DROP TABLE IF EXISTS public.job_listings;
DROP TABLE IF EXISTS public.user_profiles;
DROP TABLE IF EXISTS public.users;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. USERS TABLE (extends Supabase auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    is_onboarded BOOLEAN NOT NULL DEFAULT FALSE,
    is_fresher BOOLEAN NOT NULL DEFAULT TRUE,
    onboarding_step INTEGER NOT NULL DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 7),
    subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    daily_apply_quota INTEGER NOT NULL DEFAULT 10,
    auto_apply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    auto_apply_time TIME,
    dark_mode BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
    ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own data"
    ON public.users FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 2. USER PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,

    -- Personal Information
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    phone_prefix TEXT DEFAULT '+91',
    date_of_birth DATE,
    location_city TEXT,
    location_state TEXT,
    location_country TEXT DEFAULT 'India',
    address TEXT,
    zip_code TEXT,

    -- Social Links
    linkedin_url TEXT,
    github_url TEXT,
    portfolio_url TEXT,
    website_url TEXT,
    twitter_url TEXT,

    -- Education (JSONB array)
    -- Each: { education_level, institution, field_of_study, grade, year_start, year_end, additional_info }
    education JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Skills (array of strings)
    skills TEXT[] NOT NULL DEFAULT '{}',

    -- Work Experience (JSONB array)
    -- Each: { position, company, period, location, industry, responsibilities[], skills_acquired[] }
    experience JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Projects (JSONB array)
    -- Each: { name, description, tech_stack[], link, highlights[] }
    projects JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Achievements (JSONB array)
    -- Each: { name, description, date }
    achievements JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Certifications (JSONB array)
    -- Each: { name, issuer, date, description, url }
    certifications JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Languages (JSONB array)
    -- Each: { language, proficiency }
    languages JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Interests
    interests TEXT[] NOT NULL DEFAULT '{}',

    -- Job Preferences
    preferred_roles TEXT[] NOT NULL DEFAULT '{}',
    job_type TEXT NOT NULL DEFAULT 'both' CHECK (job_type IN ('job', 'internship', 'both')),
    preferred_locations TEXT[] NOT NULL DEFAULT '{}',
    remote_preference TEXT DEFAULT 'any' CHECK (remote_preference IN ('remote', 'onsite', 'hybrid', 'any')),
    salary_expectation_min INTEGER,
    salary_expectation_max INTEGER,
    salary_currency TEXT DEFAULT 'INR',
    notice_period_days INTEGER DEFAULT 0,

    -- Platform preferences (which job boards to search)
    platforms_enabled TEXT[] NOT NULL DEFAULT '{linkedin,naukri,indeed,glassdoor,internshala}',

    -- Work Authorization
    work_authorization JSONB DEFAULT '{}'::JSONB,

    -- Profile completeness
    profile_score INTEGER NOT NULL DEFAULT 0 CHECK (profile_score BETWEEN 0 AND 100),

    -- Resume file reference
    uploaded_resume_url TEXT,
    uploaded_resume_filename TEXT,

    -- LinkedIn import data (raw scraped data)
    linkedin_raw_data JSONB,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_skills ON public.user_profiles USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_user_profiles_preferred_roles ON public.user_profiles USING GIN(preferred_roles);

-- RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
    ON public.user_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile"
    ON public.user_profiles FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- 3. JOB LISTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.job_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Job core info
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    company_logo_url TEXT,
    location TEXT,
    work_style TEXT CHECK (work_style IN ('remote', 'onsite', 'hybrid', NULL)),
    job_type TEXT CHECK (job_type IN ('full_time', 'part_time', 'contract', 'internship', 'freelance', NULL)),
    experience_level TEXT CHECK (experience_level IN ('entry', 'mid', 'senior', 'executive', 'internship', NULL)),
    salary_min INTEGER,
    salary_max INTEGER,
    salary_currency TEXT DEFAULT 'INR',

    -- Job description
    description TEXT,
    requirements TEXT,
    responsibilities TEXT,
    benefits TEXT,

    -- Extracted keywords (for matching)
    keywords TEXT[] NOT NULL DEFAULT '{}',

    -- Source platform info
    platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'naukri', 'indeed', 'glassdoor', 'internshala', 'company_site', 'other')),
    platform_job_id TEXT,
    apply_url TEXT NOT NULL,
    is_easy_apply BOOLEAN NOT NULL DEFAULT FALSE,

    -- Posting metadata
    posted_date TIMESTAMPTZ,
    expires_date TIMESTAMPTZ,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Deduplication
    content_hash TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_listings_platform ON public.job_listings(platform);
CREATE INDEX IF NOT EXISTS idx_job_listings_company ON public.job_listings(company);
CREATE INDEX IF NOT EXISTS idx_job_listings_title ON public.job_listings(title);
CREATE INDEX IF NOT EXISTS idx_job_listings_content_hash ON public.job_listings(content_hash);
CREATE INDEX IF NOT EXISTS idx_job_listings_keywords ON public.job_listings USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_job_listings_posted_date ON public.job_listings(posted_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_listings_platform_dedup
    ON public.job_listings(platform, platform_job_id) WHERE platform_job_id IS NOT NULL;

-- RLS (all authenticated users can read job listings)
ALTER TABLE public.job_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all job listings"
    ON public.job_listings FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Service role can manage job listings"
    ON public.job_listings FOR ALL
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

-- ============================================================================
-- 4. GENERATED RESUMES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.generated_resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES public.job_listings(id) ON DELETE SET NULL,

    -- Resume content
    resume_html TEXT,
    resume_json JSONB,
    template_used TEXT CHECK (template_used IN ('fresher', 'experienced')),

    -- Generated files
    pdf_url TEXT,
    pdf_storage_path TEXT,

    -- Cover letter
    cover_letter TEXT,

    -- Generation metadata
    model_used TEXT DEFAULT 'claude-sonnet-4-20250514',
    prompt_tokens_used INTEGER,
    completion_tokens_used INTEGER,
    generation_time_ms INTEGER,

    -- User modifications
    is_user_edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_sections JSONB DEFAULT '[]'::JSONB,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_generated_resumes_user_id ON public.generated_resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_resumes_job_id ON public.generated_resumes(job_id);
CREATE INDEX IF NOT EXISTS idx_generated_resumes_created_at ON public.generated_resumes(created_at DESC);

-- RLS
ALTER TABLE public.generated_resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own resumes"
    ON public.generated_resumes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own resumes"
    ON public.generated_resumes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own resumes"
    ON public.generated_resumes FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own resumes"
    ON public.generated_resumes FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- 5. APPLICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.job_listings(id) ON DELETE CASCADE,

    -- Application status
    status TEXT NOT NULL DEFAULT 'applied'
        CHECK (status IN ('saved', 'applied', 'reviewing', 'interviewing', 'offer', 'rejected', 'withdrawn', 'failed')),
    status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Application details
    applied_via TEXT CHECK (applied_via IN ('auto_apply', 'manual', 'cold_email', 'external')),
    platform TEXT,
    resume_used_id UUID REFERENCES public.generated_resumes(id),
    cover_letter_used TEXT,

    -- AI scoring
    fit_score INTEGER CHECK (fit_score BETWEEN 0 AND 100),
    matched_keywords TEXT[] DEFAULT '{}',
    missing_skills TEXT[] DEFAULT '{}',

    -- Application form answers (JSONB)
    form_answers JSONB DEFAULT '[]'::JSONB,

    -- Error tracking
    error_message TEXT,
    error_screenshot_url TEXT,

    -- Notes
    notes TEXT,

    -- Metadata
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate applications
    UNIQUE(user_id, job_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON public.applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON public.applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_user_status ON public.applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_at ON public.applications(applied_at DESC);

-- RLS
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own applications"
    ON public.applications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own applications"
    ON public.applications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications"
    ON public.applications FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own applications"
    ON public.applications FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- 6. DREAM COMPANIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dream_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Company info
    company_name TEXT NOT NULL,
    company_domain TEXT,
    company_linkedin_url TEXT,
    company_logo_url TEXT,
    company_description TEXT,
    industry TEXT,

    -- Watchlist status
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'role_found', 'applied', 'waiting', 'paused', 'removed')),

    -- Tracking
    last_checked_at TIMESTAMPTZ,
    contacts_found_count INTEGER NOT NULL DEFAULT 0,
    roles_found_count INTEGER NOT NULL DEFAULT 0,

    -- Notes
    notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate companies per user
    UNIQUE(user_id, company_domain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dream_companies_user_id ON public.dream_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_dream_companies_status ON public.dream_companies(status);
CREATE INDEX IF NOT EXISTS idx_dream_companies_user_status ON public.dream_companies(user_id, status);

-- RLS
ALTER TABLE public.dream_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dream companies"
    ON public.dream_companies FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dream companies"
    ON public.dream_companies FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dream companies"
    ON public.dream_companies FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dream companies"
    ON public.dream_companies FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- 7. COMPANY CONTACTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.company_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    dream_company_id UUID REFERENCES public.dream_companies(id) ON DELETE CASCADE,

    -- Contact info
    contact_name TEXT NOT NULL,
    contact_title TEXT,
    contact_email TEXT,
    contact_linkedin_url TEXT,
    contact_phone TEXT,

    -- Role category
    contact_role TEXT CHECK (contact_role IN ('hr', 'recruiter', 'talent_acquisition', 'hiring_manager', 'engineering_manager', 'employee', 'other')),

    -- Source
    source TEXT CHECK (source IN ('hunter', 'apollo', 'linkedin', 'manual', 'other')),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,

    -- Company info (denormalized for convenience)
    company_name TEXT,
    company_domain TEXT,

    -- Outreach tracking
    outreach_status TEXT DEFAULT 'not_contacted'
        CHECK (outreach_status IN ('not_contacted', 'email_sent', 'email_opened', 'replied', 'connected', 'no_response')),
    last_contacted_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_contacts_user_id ON public.company_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_company_contacts_dream_company ON public.company_contacts(dream_company_id);
CREATE INDEX IF NOT EXISTS idx_company_contacts_email ON public.company_contacts(contact_email);

-- RLS
ALTER TABLE public.company_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts"
    ON public.company_contacts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts"
    ON public.company_contacts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts"
    ON public.company_contacts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts"
    ON public.company_contacts FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- 8. COLD EMAILS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cold_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.company_contacts(id) ON DELETE SET NULL,
    job_id UUID REFERENCES public.job_listings(id) ON DELETE SET NULL,

    -- Email content
    subject_line TEXT NOT NULL,
    subject_line_alt TEXT,
    body TEXT NOT NULL,
    email_type TEXT NOT NULL DEFAULT 'initial'
        CHECK (email_type IN ('initial', 'follow_up', 'linkedin_dm')),

    -- Recipient
    recipient_email TEXT,
    recipient_name TEXT,
    recipient_company TEXT,

    -- Send status
    send_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (send_status IN ('draft', 'scheduled', 'sent', 'opened', 'replied', 'bounced', 'failed')),
    sent_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,

    -- Follow-up tracking
    follow_up_of UUID REFERENCES public.cold_emails(id),
    follow_up_scheduled_at TIMESTAMPTZ,

    -- Generation metadata
    model_used TEXT DEFAULT 'claude-sonnet-4-20250514',
    tone TEXT DEFAULT 'professional' CHECK (tone IN ('professional', 'fresher', 'casual')),

    -- Gmail metadata
    gmail_message_id TEXT,
    gmail_thread_id TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cold_emails_user_id ON public.cold_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_cold_emails_contact_id ON public.cold_emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_cold_emails_send_status ON public.cold_emails(send_status);
CREATE INDEX IF NOT EXISTS idx_cold_emails_scheduled ON public.cold_emails(scheduled_for)
    WHERE send_status = 'scheduled';

-- RLS
ALTER TABLE public.cold_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own emails"
    ON public.cold_emails FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own emails"
    ON public.cold_emails FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own emails"
    ON public.cold_emails FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own emails"
    ON public.cold_emails FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- 9. JOB SEARCH SESSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.job_search_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Search parameters
    search_query TEXT,
    search_roles TEXT[] DEFAULT '{}',
    search_locations TEXT[] DEFAULT '{}',
    search_platforms TEXT[] DEFAULT '{}',
    search_filters JSONB DEFAULT '{}'::JSONB,

    -- Results tracking
    total_jobs_found INTEGER NOT NULL DEFAULT 0,
    jobs_above_threshold INTEGER NOT NULL DEFAULT 0,
    score_threshold INTEGER NOT NULL DEFAULT 60,
    platforms_searched TEXT[] DEFAULT '{}',

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Status
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    error_message TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_search_sessions_user_id ON public.job_search_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_job_search_sessions_created ON public.job_search_sessions(created_at DESC);

-- RLS
ALTER TABLE public.job_search_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search sessions"
    ON public.job_search_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own search sessions"
    ON public.job_search_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own search sessions"
    ON public.job_search_sessions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 10. SAVED JOBS TABLE (bookmarks / blacklist)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.saved_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.job_listings(id) ON DELETE CASCADE,

    save_type TEXT NOT NULL DEFAULT 'saved'
        CHECK (save_type IN ('saved', 'blacklisted')),

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, job_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id ON public.saved_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_type ON public.saved_jobs(user_id, save_type);

-- RLS
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved jobs"
    ON public.saved_jobs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved jobs"
    ON public.saved_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved jobs"
    ON public.saved_jobs FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- 11. BLACKLISTED COMPANIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.blacklisted_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    company_name TEXT NOT NULL,
    reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, company_name)
);

-- RLS
ALTER TABLE public.blacklisted_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own blacklist"
    ON public.blacklisted_companies FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 12. UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.job_listings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.applications
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.generated_resumes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dream_companies
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.company_contacts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cold_emails
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 13. AUTO-CREATE USER PROFILE ON SIGNUP
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    );

    INSERT INTO public.user_profiles (user_id)
    VALUES (NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 14. APPLICATION STATUS HISTORY (for audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.application_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by TEXT DEFAULT 'user' CHECK (changed_by IN ('user', 'system', 'auto_apply'))
);

-- Index
CREATE INDEX IF NOT EXISTS idx_status_history_app_id ON public.application_status_history(application_id);

-- RLS
ALTER TABLE public.application_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own status history"
    ON public.application_status_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own status history"
    ON public.application_status_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Trigger to log status changes
CREATE OR REPLACE FUNCTION public.log_application_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.application_status_history (application_id, user_id, old_status, new_status)
        VALUES (NEW.id, NEW.user_id, OLD.status, NEW.status);

        NEW.status_updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_application_status_change
    BEFORE UPDATE ON public.applications
    FOR EACH ROW EXECUTE FUNCTION public.log_application_status_change();

-- ============================================================================
-- 15. STORAGE BUCKETS (run via Supabase Dashboard or API)
-- ============================================================================
-- NOTE: Storage bucket creation must be done via Supabase Dashboard or API.
-- The following are the buckets to create:
--
-- 1. 'resumes' — Uploaded user resumes (PDF, DOCX)
--    - Public: false
--    - Allowed MIME types: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document
--    - Max file size: 10MB
--
-- 2. 'generated-pdfs' — AI-generated ATS resume PDFs
--    - Public: false
--    - Allowed MIME types: application/pdf
--    - Max file size: 5MB
--
-- 3. 'screenshots' — Error screenshots from failed apply attempts
--    - Public: false
--    - Allowed MIME types: image/png, image/jpeg, image/webp
--    - Max file size: 2MB
--
-- Storage RLS policies (apply after bucket creation):
--
-- INSERT policy: auth.uid() = (storage.foldername(name))[1]::uuid
-- SELECT policy: auth.uid() = (storage.foldername(name))[1]::uuid
-- UPDATE policy: auth.uid() = (storage.foldername(name))[1]::uuid
-- DELETE policy: auth.uid() = (storage.foldername(name))[1]::uuid
--
-- File naming convention: {user_id}/{filename}

-- ============================================================================
-- 16. HELPER VIEWS
-- ============================================================================

-- View: Application stats per user
CREATE OR REPLACE VIEW public.user_application_stats AS
SELECT
    user_id,
    COUNT(*) AS total_applications,
    COUNT(*) FILTER (WHERE status = 'applied') AS total_applied,
    COUNT(*) FILTER (WHERE status = 'reviewing') AS total_reviewing,
    COUNT(*) FILTER (WHERE status = 'interviewing') AS total_interviewing,
    COUNT(*) FILTER (WHERE status = 'offer') AS total_offers,
    COUNT(*) FILTER (WHERE status = 'rejected') AS total_rejected,
    COUNT(*) FILTER (WHERE status = 'failed') AS total_failed,
    ROUND(
        COUNT(*) FILTER (WHERE status IN ('reviewing', 'interviewing', 'offer'))::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE status != 'saved'), 0) * 100, 1
    ) AS response_rate_pct,
    ROUND(
        COUNT(*) FILTER (WHERE status IN ('interviewing', 'offer'))::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE status != 'saved'), 0) * 100, 1
    ) AS interview_conversion_pct,
    AVG(fit_score)::INTEGER AS avg_fit_score,
    MAX(applied_at) AS last_applied_at
FROM public.applications
GROUP BY user_id;

-- View: Daily application counts
CREATE OR REPLACE VIEW public.daily_application_counts AS
SELECT
    user_id,
    DATE(applied_at) AS apply_date,
    COUNT(*) AS applications_count,
    ARRAY_AGG(DISTINCT platform) AS platforms_used
FROM public.applications
WHERE status != 'saved'
GROUP BY user_id, DATE(applied_at)
ORDER BY apply_date DESC;

-- ============================================================================
-- SCHEMA COMPLETE
-- ============================================================================
