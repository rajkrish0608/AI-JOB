# AI-JOB

> **AI Job Apply** — An AI-powered job application platform that automates job searching, resume generation, and application submission across multiple job boards.

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), shadcn/ui, Tailwind CSS, Zustand |
| **Backend** | FastAPI (Python), Pydantic V2 |
| **Database** | Supabase (PostgreSQL) with Row Level Security |
| **Cache/Queue** | Redis, arq (async task queue) |
| **AI/LLM** | Claude Sonnet (resume gen), Claude Haiku (scoring) |
| **Scraping** | Playwright (stealth), Apify |
| **Auth** | Supabase Auth (Google + Magic Link) |

## 📂 Project Structure

```
ai-job-apply/
├── apps/
│   ├── web/          # Next.js 14 frontend
│   └── api/          # FastAPI backend
├── supabase/
│   └── migrations/   # SQL schema + seed data
├── docker-compose.yml
├── .env.example
└── README.md
```

## 🗄️ Database Schema (P1.1 — Complete ✅)

The schema includes **12 tables** with full RLS:

| Table | Purpose |
|-------|---------|
| `users` | Extends Supabase auth, stores preferences |
| `user_profiles` | Full profile with education, experience, skills |
| `job_listings` | Scraped jobs from 5 platforms |
| `applications` | Application tracking with status workflow |
| `generated_resumes` | AI-generated ATS resumes |
| `dream_companies` | Company watchlist |
| `company_contacts` | HR/recruiter contact info |
| `cold_emails` | Generated outreach emails |
| `job_search_sessions` | Search history |
| `saved_jobs` | Bookmarks and blacklist |
| `blacklisted_companies` | Company exclusion list |
| `application_status_history` | Status change audit trail |

### Key Features
- ✅ Row Level Security on **all** tables
- ✅ Auto `updated_at` triggers
- ✅ Auto user profile creation on signup
- ✅ Application status change audit logging
- ✅ GIN indexes for array/JSONB search
- ✅ Job deduplication via content hash + platform ID
- ✅ Analytics views for dashboard stats

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase account
- Redis

### Setup

```bash
# Clone the repo
git clone https://github.com/rajkrish0608/AI-JOB.git
cd AI-JOB

# Run the SQL migration on your Supabase project
# Copy contents of supabase/migrations/001_initial_schema.sql
# into the Supabase SQL Editor and execute
```

## 📋 Implementation Phases

- [x] **P1.1** — Supabase schema + RLS
- [ ] **P1.2** — FastAPI skeleton
- [ ] **P1.3** — Next.js skeleton + design tokens
- [ ] **P1.4** — Auth flow
- [ ] **P1.5** — Dashboard shell
- [ ] **Phase 2** — Profile Builder
- [ ] **Phase 3** — Job Search Engine
- [ ] **Phase 4** — ATS Resume Generator
- [ ] **Phase 5** — Auto Apply Engine
- [ ] **Phase 6** — Cold Email & HR Outreach
- [ ] **Phase 7** — Dream Company Pipeline
- [ ] **Phase 8** — Job Tracker Dashboard

## 📄 License

MIT
