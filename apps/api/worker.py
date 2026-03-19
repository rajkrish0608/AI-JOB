"""
Background Worker (arq)
=========================
Processes slow job application tasks asynchronously via Redis.

To run:
  cd apps/api
  arq worker.WorkerSettings
"""

import os
from arq import worker
from arq.connections import RedisSettings

# We can import our Playwright router logic directly.
# For Clean Architecture, the logic in routers should ideally be extracted 
# to a service layer `services/apply.py`, but we can call the router logic here.
from routers.apply_linkedin import apply_linkedin_easy, LinkedInApplyRequest
from routers.apply_naukri import apply_naukri_quick, NaukriApplyRequest
from routers.apply_indeed import apply_indeed, IndeedApplyRequest
from routers.apply_internshala import apply_internshala, InternshalaApplyRequest


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


class WorkerSettings:
    functions = [
        task_apply_linkedin,
        task_apply_naukri,
        task_apply_indeed,
        task_apply_internshala,
    ]
    redis_settings = RedisSettings(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=6379,
    )
    max_jobs = 10 # Control browser concurrency
    job_timeout = 300 # 5 minutes max per application
