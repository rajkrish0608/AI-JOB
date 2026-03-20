"""
Background Worker (arq)
=========================
Processes slow job application tasks asynchronously via Redis.

To run:
  cd apps/api
  arq worker.WorkerSettings
"""

import os
from arq import worker, cron
from arq.connections import RedisSettings

# We can import our Playwright router logic directly.
# For Clean Architecture, the logic in routers should ideally be extracted 
# to a service layer `services/apply.py`, but we can call the router logic here.
from routers.apply_linkedin import apply_linkedin_easy, LinkedInApplyRequest
from routers.apply_naukri import apply_naukri_quick, NaukriApplyRequest
from routers.apply_indeed import apply_indeed, IndeedApplyRequest
from routers.apply_internshala import apply_internshala, InternshalaApplyRequest
from services.dream_scanner import scan_all_companies_for_user


async def task_apply_linkedin(ctx, job_url: str, cookie: str, profile: dict):
    req = LinkedInApplyRequest(
        job_url=job_url,
        li_at_cookie=cookie,
        profile=profile,
        headless=True
    )
    res = await apply_linkedin_easy(req)
    return res.dict()


async def task_apply_naukri(ctx, job_url: str, cookies: dict, profile: dict):
    req = NaukriApplyRequest(
        job_url=job_url,
        auth_cookies=cookies,
        profile=profile,
        headless=True
    )
    res = await apply_naukri_quick(req)
    return res.dict()


async def task_apply_indeed(ctx, job_url: str, cookies: dict, profile: dict):
    req = IndeedApplyRequest(
        job_url=job_url,
        auth_cookies=cookies,
        profile=profile,
        headless=True
    )
    res = await apply_indeed(req)
    return res.dict()


async def task_apply_internshala(ctx, job_url: str, cookies: dict, profile: dict):
    req = InternshalaApplyRequest(
        job_url=job_url,
        auth_cookies=cookies,
        profile=profile,
        headless=True
    )
    res = await apply_internshala(req)
    return res.dict()


# ── Dream Company Scanner Task ────────────────────────────────────────────────

async def task_scan_dream_companies(ctx, user_id: str):
    """
    Background task: Scans all active dream companies for a given user.
    - Finds new job openings using the jobs aggregator.
    - Discovers new HR/recruiter contacts via Hunter.io + Apollo.io.
    - Updates roles_found_count, contacts_found_count, and last_checked_at.

    Enqueue manually:
      await redis.enqueue_job('task_scan_dream_companies', user_id='<uuid>')
    """
    print(f"[dream_scanner] Starting scan for user {user_id}")
    results = await scan_all_companies_for_user(user_id=user_id)
    for r in results:
        company = r.get("company", "unknown")
        roles   = r.get("roles_found", 0)
        new_c   = r.get("contacts_inserted", 0)
        print(f"[dream_scanner] {company}: {roles} roles, {new_c} new contacts")
    return {"user_id": user_id, "scanned": len(results), "results": results}


async def cron_scan_all_active_users(ctx):
    """
    Daily cron: Fetches ALL users with active dream companies and scans each.
    Runs once a day at 02:00 UTC (07:30 IST) so results are fresh by morning.
    """
    from services.dream_scanner import _get_supabase

    db = await _get_supabase()
    # Get all distinct user_ids with at least one active dream company
    res = await db.table("dream_companies") \
        .select("user_id") \
        .eq("status", "active") \
        .execute()
    if not res.data:
        print("[cron_scan] No active dream companies found.")
        return

    # Deduplicate user IDs
    user_ids = list({row["user_id"] for row in res.data})
    print(f"[cron_scan] Scanning for {len(user_ids)} users...")

    for uid in user_ids:
        results = await scan_all_companies_for_user(uid)
        print(f"[cron_scan] user {uid}: scanned {len(results)} companies")


class WorkerSettings:
    functions = [
        task_apply_linkedin,
        task_apply_naukri,
        task_apply_indeed,
        task_apply_internshala,
        task_scan_dream_companies,   # ← Manual per-user scan
    ]
    cron_jobs = [
        cron(cron_scan_all_active_users, hour=2, minute=0),   # Daily at 02:00 UTC
    ]
    redis_settings = RedisSettings(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=6379,
    )
    max_jobs = 10  # Control browser concurrency
    job_timeout = 300  # 5 minutes max per application
