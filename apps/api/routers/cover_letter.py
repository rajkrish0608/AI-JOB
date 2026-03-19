"""
Cover Letter Generator
=======================
Uses Claude 3.5 Sonnet to write a tailored, authentic cover letter
from the user's profile and a target job posting.

Endpoint:
  POST /api/resume/cover-letter

Returns the generated text in Markdown and plain text formats.
"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from anthropic import AsyncAnthropic

router = APIRouter()
client = AsyncAnthropic()

# ── Models ───────────────────────────────────────────────────────────────────

class CoverLetterProfile(BaseModel):
    full_name: str
    skills: list[str] = []
    experience: list[dict] = []
    education: list[dict] = []
    projects: list[dict] = []

class CoverLetterJob(BaseModel):
    title: str
    company: str
    description: str
    hiring_manager: str | None = None

class CoverLetterRequest(BaseModel):
    profile: CoverLetterProfile
    job: CoverLetterJob
    tone: str = "confident"        # confident, formal, enthusiastic, conversational
    include_hook: bool = True      # Start with a compelling opening hook?
    word_count: int = 350          # Target word count (250-500)

class CoverLetterResponse(BaseModel):
    status: str
    cover_letter_markdown: str
    cover_letter_plain: str
    word_count: int
    key_selling_points: list[str]

# ── Prompt ───────────────────────────────────────────────────────────────────

COVER_LETTER_PROMPT = """
You are an expert career coach and professional writer who writes highly personalized, 
authentic cover letters that stand out to hiring managers. You avoid clichés.

CANDIDATE PROFILE:
{profile}

TARGET JOB:
Title: {title}
Company: {company}
Hiring Manager: {hiring_manager}
Job Description:
{description}

REQUIREMENTS:
- Tone: {tone}
- Include compelling opening hook: {include_hook}
- Target word count: approximately {word_count} words

Write a professional cover letter. Return ONLY valid JSON with this structure:
{{
  "cover_letter_markdown": "Full cover letter in Markdown format (use \\n for newlines)",
  "cover_letter_plain": "Same cover letter as plain text, no Markdown syntax",
  "key_selling_points": ["Point 1 about why candidate fits", "Point 2", "Point 3"]
}}

WRITING RULES:
1. Open with a STRONG hook specific to the company/role — NOT "I am writing to apply for..."
2. Paragraph 1 (Hook + Who You Are): Brief, compelling intro that names the role and a key value-add
3. Paragraph 2 (Why You're the Best Fit): 2-3 specific achievements from experience that directly map to the JD
4. Paragraph 3 (Why This Company): Genuinely explain what excites you about THIS specific company — research their mission/product
5. Closing: Confident but not arrogant call-to-action
6. Use the candidate's REAL skills and experience — do NOT fabricate details
7. Keep it to {word_count} words, no fluff
8. Sign off as: {full_name}
9. Do NOT use the phrase "I am writing to apply"
10. Avoid passive voice wherever possible

Return ONLY valid JSON. No markdown fences.
"""

# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/resume/cover-letter", response_model=CoverLetterResponse)
async def generate_cover_letter(body: CoverLetterRequest):
    """
    Generates a tailored, ATS-friendly cover letter using Claude.
    """
    import re

    profile_dict = body.profile.model_dump()
    hiring_manager = body.job.hiring_manager or "Hiring Manager"

    try:
        ai_resp = await client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=2048,
            temperature=0.7,
            system="You are a professional cover letter writer. Return only valid JSON.",
            messages=[
                {
                    "role": "user",
                    "content": COVER_LETTER_PROMPT.format(
                        profile=json.dumps(profile_dict, indent=2),
                        title=body.job.title,
                        company=body.job.company,
                        hiring_manager=hiring_manager,
                        description=body.job.description,
                        tone=body.tone,
                        include_hook=str(body.include_hook),
                        word_count=body.word_count,
                        full_name=body.profile.full_name,
                    ),
                }
            ],
        )

        content = ai_resp.content[0].text.strip()
        if content.startswith("```"):
            content = re.sub(r"^```\w*\n?", "", content)
            content = re.sub(r"\n?```$", "", content)

        data = json.loads(content)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON. Please retry.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cover letter generation failed: {str(exc)}")

    plain_text = data.get("cover_letter_plain", "")
    actual_word_count = len(plain_text.split())

    return CoverLetterResponse(
        status="success",
        cover_letter_markdown=data.get("cover_letter_markdown", ""),
        cover_letter_plain=plain_text,
        word_count=actual_word_count,
        key_selling_points=data.get("key_selling_points", []),
    )
