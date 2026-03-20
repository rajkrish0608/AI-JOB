"""
AI Fit Scorer
=============
Uses Claude 3.5 Sonnet to score how well a batch of job listings
match a user's profile (skills, experience, preferences).

The scorer receives:
  1. A user profile summary (skills, experience, preferences)
  2. A list of job listings (from the aggregator)

It returns each job annotated with:
  - fit_score (0-100)
  - fit_reasons (list of strings explaining why)
  - missing_skills (skills the job wants but the user lacks)
"""

import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import google.generativeai as genai

router = APIRouter()

# Configure Gemini
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel(
    model_name="gemini-1.5-flash",
    generation_config={"response_mime_type": "application/json"}
)

# ── Models ───────────────────────────────────────────────────────────────────

class UserProfile(BaseModel):
    skills: list[str] = []
    experience: list[dict] = []
    education: list[dict] = []
    preferred_roles: list[str] = []
    preferred_locations: list[str] = []
    preferred_job_type: Optional[str] = None  # Full-time, Part-time, etc.
    years_of_experience: Optional[int] = None

class JobToScore(BaseModel):
    title: str
    company: str
    location: str
    url: str
    description_snippet: Optional[str] = None
    salary: Optional[str] = None
    source: str

class ScoredJob(BaseModel):
    title: str
    company: str
    location: str
    url: str
    description_snippet: Optional[str] = None
    salary: Optional[str] = None
    source: str
    fit_score: int  # 0-100
    fit_reasons: list[str]
    missing_skills: list[str]

class FitScoreRequest(BaseModel):
    profile: UserProfile
    jobs: list[JobToScore]

class FitScoreResponse(BaseModel):
    status: str
    scored_jobs: list[ScoredJob]

# ── Prompt ───────────────────────────────────────────────────────────────────

SCORING_PROMPT = """
You are an AI career matching engine.

Given a candidate profile and a list of job listings, score each job
on a 0-100 scale based on how well the candidate fits.

CANDIDATE PROFILE:
{profile}

JOB LISTINGS (JSON array):
{jobs}

For EACH job, return a JSON object with these fields:
- "index": the 0-based index of the job in the input array
- "fit_score": integer 0-100 (100 = perfect match)
- "fit_reasons": array of 2-3 short reason strings explaining the score
- "missing_skills": array of skills the job likely requires but the candidate lacks

SCORING GUIDELINES:
- 90-100: Ideal match — skills, experience level, and preferences align perfectly
- 70-89:  Strong match — most skills match, minor gaps
- 50-69:  Moderate match — some relevant skills, notable gaps
- 30-49:  Weak match — few overlapping skills, may be a stretch
- 0-29:   Poor match — very little alignment

Return ONLY a valid JSON array of objects. No markdown, no explanation.
"""

# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/jobs/score", response_model=FitScoreResponse)
async def score_jobs(body: FitScoreRequest):
    """
    Score a batch of jobs against a user profile using Claude AI.
    Accepts up to 20 jobs per request to stay within token limits.
    """

    if len(body.jobs) > 20:
        raise HTTPException(
            status_code=400,
            detail="Maximum 20 jobs per scoring request. Paginate your calls."
        )

    if not body.jobs:
        return FitScoreResponse(status="success", scored_jobs=[])

    # Build profile summary string
    profile_summary = {
        "skills": body.profile.skills,
        "preferred_roles": body.profile.preferred_roles,
        "preferred_locations": body.profile.preferred_locations,
        "preferred_job_type": body.profile.preferred_job_type,
        "years_of_experience": body.profile.years_of_experience,
        "experience_summary": [
            f"{exp.get('position', '')} at {exp.get('company', '')} ({exp.get('period', '')})"
            for exp in body.profile.experience
        ],
        "education_summary": [
            f"{edu.get('education_level', '')} in {edu.get('field_of_study', '')} from {edu.get('institution', '')}"
            for edu in body.profile.education
        ],
    }

    jobs_for_prompt = [
        {
            "index": i,
            "title": j.title,
            "company": j.company,
            "location": j.location,
            "snippet": j.description_snippet or "",
            "salary": j.salary or "",
        }
        for i, j in enumerate(body.jobs)
    ]

    try:
        ai_resp = await model.generate_content_async(
            SCORING_PROMPT.format(
                profile=json.dumps(profile_summary, indent=2),
                jobs=json.dumps(jobs_for_prompt, indent=2),
            ),
            generation_config={"temperature": 0.0},
        )

        content = ai_resp.text.strip()
        scores = json.loads(content)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON. Please retry.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI scoring failed: {str(exc)}")

    # Merge scores back into the original job objects
    score_map: dict[int, dict] = {}
    for s in scores:
        idx = s.get("index", -1)
        if 0 <= idx < len(body.jobs):
            score_map[idx] = s

    scored_jobs: list[ScoredJob] = []
    for i, job in enumerate(body.jobs):
        s = score_map.get(i, {})
        scored_jobs.append(
            ScoredJob(
                title=job.title,
                company=job.company,
                location=job.location,
                url=job.url,
                description_snippet=job.description_snippet,
                salary=job.salary,
                source=job.source,
                fit_score=s.get("fit_score", 0),
                fit_reasons=s.get("fit_reasons", []),
                missing_skills=s.get("missing_skills", []),
            )
        )

    # Sort by fit_score descending
    scored_jobs.sort(key=lambda j: j.fit_score, reverse=True)

    return FitScoreResponse(status="success", scored_jobs=scored_jobs)
