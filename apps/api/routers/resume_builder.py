"""
ATS Resume Builder Service
===========================
Uses Claude 3.5 Sonnet to generate an ATS-optimized, tailored resume
given a user profile and (optionally) a target job listing.

Returns structured JSON that can be rendered into multiple formats
(PDF, DOCX, HTML) by downstream services.

Endpoint:
  POST /api/resume/generate
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
    model_name="gemini-1.5-pro",
    generation_config={"response_mime_type": "application/json"}
)

# ── Models ───────────────────────────────────────────────────────────────────

class ProfileInput(BaseModel):
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    summary: Optional[str] = None
    skills: list[str] = []
    experience: list[dict] = []
    education: list[dict] = []
    projects: list[dict] = []
    certifications: list[str] = []
    languages: list[str] = []

class TargetJob(BaseModel):
    title: str
    company: str
    description: Optional[str] = None
    required_skills: list[str] = []
    preferred_skills: list[str] = []

class ResumeGenerateRequest(BaseModel):
    profile: ProfileInput
    target_job: Optional[TargetJob] = None
    template: str = "professional"  # professional, modern, minimal, technical
    tone: str = "confident"         # confident, formal, creative

class ResumeSection(BaseModel):
    heading: str
    content: str  # Markdown formatted

class GeneratedResume(BaseModel):
    full_name: str
    contact_line: str
    professional_summary: str
    sections: list[ResumeSection]
    ats_keywords: list[str]
    tailoring_notes: Optional[str] = None

class ResumeGenerateResponse(BaseModel):
    status: str
    resume: GeneratedResume
    ats_score: int  # Estimated ATS compatibility 0-100

# ── Prompt ───────────────────────────────────────────────────────────────────

RESUME_PROMPT = """
You are an expert resume writer who specializes in creating ATS-optimized resumes
that pass Applicant Tracking Systems while remaining compelling to human readers.

CANDIDATE PROFILE:
{profile}

{job_context}

TEMPLATE STYLE: {template}
TONE: {tone}

Generate a complete, ATS-optimized resume. Return ONLY valid JSON with this structure:
{{
  "full_name": "Candidate Name",
  "contact_line": "email | phone | location | linkedin",
  "professional_summary": "2-3 sentence power summary tailored to the role",
  "sections": [
    {{
      "heading": "TECHNICAL SKILLS",
      "content": "Markdown-formatted content with bullet points"
    }},
    {{
      "heading": "PROFESSIONAL EXPERIENCE",
      "content": "Markdown-formatted with company, role, dates, and bullet point achievements using STAR method and quantified metrics"
    }},
    {{
      "heading": "EDUCATION",
      "content": "Markdown-formatted education entries"
    }},
    {{
      "heading": "PROJECTS",
      "content": "Markdown-formatted project entries with tech stacks"
    }},
    {{
      "heading": "CERTIFICATIONS",
      "content": "List of certifications"
    }}
  ],
  "ats_keywords": ["keyword1", "keyword2", ...],
  "tailoring_notes": "Brief explanation of how the resume was tailored"
}}

RESUME WRITING RULES:
1. Use STRONG ACTION VERBS: Led, Developed, Architected, Optimized, Delivered, Spearheaded
2. QUANTIFY ACHIEVEMENTS: "Reduced load time by 40%", "Managed team of 8 engineers"
3. Use the STAR method (Situation, Task, Action, Result) for experience bullets
4. Mirror keywords from the job description naturally (if provided)
5. Keep each bullet point to ONE line
6. Include the most relevant skills FIRST
7. NO personal pronouns (I, me, my)
8. NO graphics, tables, or special characters that break ATS parsers
9. Omit sections that have no data (e.g., skip CERTIFICATIONS if empty)
10. Professional summary should be tailored to the target job if one is provided

Return ONLY valid JSON. No markdown fences, no explanation text.
"""

# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/resume/generate", response_model=ResumeGenerateResponse)
async def generate_resume(body: ResumeGenerateRequest):
    """
    Generate an ATS-optimized resume from a user profile.
    Optionally tailored to a specific job listing.
    """

    profile_dict = body.profile.model_dump()

    # Build job context
    job_context = ""
    if body.target_job:
        job_context = f"""TARGET JOB TO TAILOR FOR:
Title: {body.target_job.title}
Company: {body.target_job.company}
Description: {body.target_job.description or 'Not provided'}
Required Skills: {', '.join(body.target_job.required_skills) if body.target_job.required_skills else 'Not specified'}
Preferred Skills: {', '.join(body.target_job.preferred_skills) if body.target_job.preferred_skills else 'Not specified'}

IMPORTANT: Tailor the resume specifically for this role. Mirror their language and prioritize relevant experience."""
    else:
        job_context = "NO SPECIFIC JOB TARGET: Create a general-purpose, strong resume."

    try:
        prompt_text = RESUME_PROMPT.format(
            profile=json.dumps(profile_dict, indent=2),
            job_context=job_context,
            template=body.template,
            tone=body.tone,
        )

        ai_resp = await model.generate_content_async(
            prompt_text,
            generation_config={"temperature": 0.3},
        )

        content = ai_resp.text.strip()
        resume_data = json.loads(content)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON. Please retry.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Resume generation failed: {str(exc)}")

    # Build GeneratedResume
    sections = [
        ResumeSection(heading=s.get("heading", ""), content=s.get("content", ""))
        for s in resume_data.get("sections", [])
        if s.get("content", "").strip()  # Skip empty sections
    ]

    resume = GeneratedResume(
        full_name=resume_data.get("full_name", body.profile.full_name),
        contact_line=resume_data.get("contact_line", ""),
        professional_summary=resume_data.get("professional_summary", ""),
        sections=sections,
        ats_keywords=resume_data.get("ats_keywords", []),
        tailoring_notes=resume_data.get("tailoring_notes"),
    )

    # Calculate a rough ATS score
    ats_score = _estimate_ats_score(resume, body.target_job)

    return ResumeGenerateResponse(
        status="success",
        resume=resume,
        ats_score=ats_score,
    )


def _estimate_ats_score(resume: GeneratedResume, target_job: Optional[TargetJob]) -> int:
    """
    Heuristic ATS compatibility score.
    A real ATS would parse for keywords, formatting, etc.
    """
    score = 50  # Base score

    # +10 for having a professional summary
    if resume.professional_summary and len(resume.professional_summary) > 30:
        score += 10

    # +10 for having >= 3 sections
    if len(resume.sections) >= 3:
        score += 10

    # +10 for having ATS keywords
    if len(resume.ats_keywords) >= 5:
        score += 10

    # +10 for keyword overlap with target job
    if target_job and target_job.required_skills:
        resume_text = " ".join([s.content for s in resume.sections]).lower()
        matches = sum(1 for skill in target_job.required_skills if skill.lower() in resume_text)
        overlap_ratio = matches / len(target_job.required_skills) if target_job.required_skills else 0
        score += int(overlap_ratio * 15)

    # +5 for contact info being present
    if resume.contact_line and "|" in resume.contact_line:
        score += 5

    return min(score, 100)
