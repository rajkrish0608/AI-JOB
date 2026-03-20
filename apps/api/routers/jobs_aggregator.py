"""
Job Search Aggregator
=====================
Fan-out endpoint that calls all platform scrapers concurrently (asyncio.gather),
merges results, deduplicates, and returns a single ranked list.

Endpoints consumed:
  - /api/jobs/linkedin
  - /api/jobs/naukri
  - /api/jobs/indeed
  - /api/jobs/glassdoor
  - /api/jobs/internshala

Deduplication strategy:
  - Normalise (title + company) → lowercase, strip punctuation.
  - Keep only the first occurrence of each unique pair.

Sorting:
  - Jobs with a known posted date are sorted newest-first.
  - Jobs without a date sink to the end.
"""

import asyncio
import re
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional
import httpx

router = APIRouter()

# ── Models ───────────────────────────────────────────────────────────────────

class AggregatedJob(BaseModel):
    title: str
    company: str
    location: str
    url: str
    posted: Optional[str] = None
    description_snippet: Optional[str] = None
    salary: Optional[str] = None
    experience: Optional[str] = None
    source: str

class AggregateResponse(BaseModel):
    status: str
    total: int
    jobs: list[AggregatedJob]
    source_counts: dict[str, int]
    message: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _dedup_key(job: dict) -> str:
    """Returns a normalised string for deduplication."""
    title = re.sub(r"[^\w\s]", "", job.get("title", "")).lower().strip()
    company = re.sub(r"[^\w\s]", "", job.get("company", "")).lower().strip()
    return f"{title}|{company}"


async def _fetch_jobs(client: httpx.AsyncClient, url: str, params: dict) -> list[dict]:
    """Safely fetch from a scraper endpoint; returns [] on error."""
    try:
        resp = await client.get(url, params=params, timeout=25.0)
        data = resp.json()
        return data.get("jobs", [])
    except Exception:
        return []


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/jobs/aggregate", response_model=AggregateResponse)
async def aggregate_jobs(
    keywords: str = Query(..., description="Job title or keywords"),
    location: str = Query("India", description="Location to search in"),
    sources: str = Query(
        "linkedin,naukri,indeed,glassdoor,internshala",
        description="Comma-separated list of sources to include",
    ),
    max_per_source: int = Query(25, ge=1, le=50, description="Max jobs per source"),
):
    """
    Fan-out job search across all 5 platforms simultaneously.
    Merges, deduplicates, and returns a sorted list of jobs.
    """

    enabled_sources = {s.strip().lower() for s in sources.split(",")}

    # Map source name → internal endpoint path + any extra params
    SOURCE_MAP = {
        "linkedin":   ("/api/jobs/linkedin",   {"keywords": keywords, "location": location}),
        "naukri":     ("/api/jobs/naukri",      {"keywords": keywords, "location": location}),
        "indeed":     ("/api/jobs/indeed",      {"keywords": keywords, "location": location}),
        "glassdoor":  ("/api/jobs/glassdoor",   {"keywords": keywords, "location": location}),
        "internshala":("/api/jobs/internshala", {"keywords": keywords, "location": location}),
    }

    # Internal FastAPI base URL (self-call)
    BASE = "http://127.0.0.1:8000"

    async with httpx.AsyncClient(base_url=BASE, follow_redirects=True) as client:
        tasks = []
        task_sources: list[str] = []

        for source, (path, params) in SOURCE_MAP.items():
            if source in enabled_sources:
                tasks.append(_fetch_jobs(client, path, params))
                task_sources.append(source)

        results = await asyncio.gather(*tasks)

    # ── Merge + deduplicate ────────────────────────────────────────────────
    seen: set[str] = set()
    merged: list[dict] = []
    source_counts: dict[str, int] = {}

    for source_name, job_list in zip(task_sources, results):
        count = 0
        for job in job_list[:max_per_source]:
            key = _dedup_key(job)
            if key not in seen:
                seen.add(key)
                # Normalise to AggregatedJob fields
                merged.append({
                    "title":                job.get("title", "Unknown"),
                    "company":              job.get("company", "Unknown"),
                    "location":             job.get("location", ""),
                    "url":                  job.get("url", ""),
                    "posted":               job.get("posted"),
                    "description_snippet":  job.get("description_snippet"),
                    "salary":               job.get("salary"),
                    "experience":           job.get("experience"),
                    "source":               source_name,
                })
                count += 1
        source_counts[source_name] = count

    # ── Sort: newest first; undated jobs go last ──────────────────────────
    def _sort_key(job: dict) -> tuple[int, str]:
        posted = job.get("posted")
        # Earlier in alphabet → higher priority if date string present
        return (0 if posted else 1, posted or "")

    merged.sort(key=_sort_key)

    return AggregateResponse(
        status="success",
        total=len(merged),
        jobs=[AggregatedJob(**j) for j in merged],
        source_counts=source_counts,
    )
