"""
Cold Email Generator — AI-Powered Outreach
============================================
Uses Google Gemini to generate personalized cold outreach emails
targeting HR contacts, recruiters, and hiring managers discovered via
the HR Email Finder (P6.1).

Endpoints:
  POST /api/outreach/generate-email     → generate a single cold email
  POST /api/outreach/generate-email/batch → generate emails for multiple contacts
  POST /api/outreach/generate-followup  → generate a follow-up email
"""

import json
import re
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import os
import google.generativeai as genai

router = APIRouter()

# Configure Gemini
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    generation_config={"response_mime_type": "application/json"}
)

# ── Models ───────────────────────────────────────────────────────────

class SenderProfile(BaseModel):
    full_name: str
    current_title: Optional[str] = None
    skills: List[str] = []
    experience_summary: Optional[str] = None   # 2-3 sentence elevator pitch
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    notable_achievement: Optional[str] = None   # e.g. "Increased revenue 40%"

class RecipientInfo(BaseModel):
    name: Optional[str] = None
    first_name: Optional[str] = None
    email: Optional[str] = None
    title: Optional[str] = None                 # e.g. "Technical Recruiter"
    company_name: str
    department: Optional[str] = None

class TargetRole(BaseModel):
    title: str                                   # e.g. "Senior Backend Engineer"
    job_url: Optional[str] = None
    description_snippet: Optional[str] = None    # First ~200 chars of JD
    why_interested: Optional[str] = None         # User's personal reason

class GenerateEmailRequest(BaseModel):
    sender: SenderProfile
    recipient: RecipientInfo
    target_role: Optional[TargetRole] = None     # None = general networking email
    tone: str = "professional"                   # professional, friendly, enthusiastic, bold
    email_type: str = "cold_intro"               # cold_intro, referral_request, informational_interview
    max_words: int = 150                         # Keep cold emails SHORT

class GeneratedEmail(BaseModel):
    subject_line: str
    body_html: str                               # Rich HTML for email client
    body_plain: str                              # Plain text fallback
    word_count: int
    personalization_notes: List[str]             # Why this email is personalized
    suggested_send_time: Optional[str] = None    # e.g. "Tuesday 9-10am"

class GenerateEmailResponse(BaseModel):
    status: str
    email: GeneratedEmail
    recipient_name: Optional[str] = None
    recipient_email: Optional[str] = None

class BatchEmailRequest(BaseModel):
    sender: SenderProfile
    recipients: List[RecipientInfo]
    target_role: Optional[TargetRole] = None
    tone: str = "professional"
    email_type: str = "cold_intro"
    max_words: int = 150

class BatchEmailResponse(BaseModel):
    status: str
    emails: List[GenerateEmailResponse]
    total_generated: int

class FollowUpRequest(BaseModel):
    sender: SenderProfile
    recipient: RecipientInfo
    original_subject: str
    original_body_snippet: str                   # First ~200 chars of the original email
    days_since_sent: int = 5
    followup_number: int = 1                     # 1st, 2nd, 3rd follow-up
    tone: str = "professional"

class FollowUpResponse(BaseModel):
    status: str
    subject_line: str
    body_html: str
    body_plain: str
    word_count: int


# ── Prompts ──────────────────────────────────────────────────────────

COLD_EMAIL_PROMPT = """You are an expert cold email copywriter for job seekers. 
You write highly personalized, concise cold emails that get responses from 
recruiters and hiring managers. You follow proven cold email frameworks.

SENDER PROFILE:
{sender_json}

RECIPIENT:
Name: {recipient_name}
Title: {recipient_title}
Company: {company_name}
Department: {department}

TARGET ROLE: {target_role_info}

EMAIL TYPE: {email_type}
TONE: {tone}
MAX WORDS: {max_words}

COLD EMAIL RULES:
1. Subject line: 5-8 words max, NO clickbait, must feel personal
2. Opening line: Reference something specific about the company/person — NOT "I hope this finds you well"
3. Value proposition: What YOU bring to THEM in 1-2 sentences
4. Social proof: One specific, quantified achievement
5. Clear CTA: Ask ONE simple question — "Would you be open to a 15-min chat?"
6. Total body: Under {max_words} words — ruthlessly concise
7. NO attachments mention. NO desperation. NO "I know you're busy."
8. Sign off casually — "Best," or "Cheers," not "Respectfully yours"
9. Include a P.S. line with something memorable or a link to portfolio/LinkedIn
10. For referral_request: Ask if they know who's hiring, not for a job directly
11. For informational_interview: Ask about their career path, not for a job

EMAIL TYPE FRAMEWORKS:
- cold_intro: Hook → Credential → Ask → P.S.
- referral_request: Mutual context → Your value → Soft ask → P.S.
- informational_interview: Admiration → Specific question → Time ask → P.S.

Return ONLY valid JSON:
{{
  "subject_line": "Short, personal subject",
  "body_html": "<p>Email body with HTML formatting</p><p>Use <b>bold</b> for key points</p><p>P.S. line here</p>",
  "body_plain": "Same email as plain text",
  "personalization_notes": ["Why this email is personalized point 1", "Point 2"],
  "suggested_send_time": "Tuesday or Thursday, 9-10am recipient's timezone"
}}
"""

FOLLOWUP_PROMPT = """You are an expert at writing follow-up emails for job seekers.
You write brief, value-adding follow-ups that don't feel pushy.

SENDER: {sender_name} ({sender_title})
RECIPIENT: {recipient_name} at {company_name} ({recipient_title})
ORIGINAL SUBJECT: {original_subject}
ORIGINAL EMAIL SNIPPET: {original_snippet}
DAYS SINCE SENT: {days_since}
FOLLOW-UP NUMBER: {followup_number}
TONE: {tone}

FOLLOW-UP RULES:
1. Reply to the same thread — subject starts with "Re: "
2. Follow-up {followup_number}:
   - 1st: Add new value (article, achievement, company news reference)
   - 2nd: Shorter, "bumping this up" with a new angle
   - 3rd: "Closing the loop" — give them an easy out
3. Under 75 words for follow-ups
4. Never guilt-trip or say "just checking in" or "circling back"
5. Add ONE new piece of value or context

Return ONLY valid JSON:
{{
  "subject_line": "Re: Original subject",
  "body_html": "<p>Follow-up body in HTML</p>",
  "body_plain": "Follow-up body as plain text"
}}
"""


# ── Helpers ──────────────────────────────────────────────────────────

def _clean_ai_json(text: str) -> str:
    """Strip markdown fences and clean AI response for JSON parsing."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()


async def _generate_single_email(
    sender: SenderProfile,
    recipient: RecipientInfo,
    target_role: Optional[TargetRole],
    tone: str,
    email_type: str,
    max_words: int,
) -> GenerateEmailResponse:
    """Core function: generate one personalized cold email via Gemini AI."""

    sender_dict = sender.model_dump()

    # Build target role info string
    if target_role:
        target_info = (
            f"Title: {target_role.title}\n"
            f"Job URL: {target_role.job_url or 'Not provided'}\n"
            f"Description: {target_role.description_snippet or 'Not provided'}\n"
            f"Why interested: {target_role.why_interested or 'Not specified'}"
        )
    else:
        target_info = "No specific role — this is a general networking/introduction email."

    prompt = COLD_EMAIL_PROMPT.format(
        sender_json=json.dumps(sender_dict, indent=2),
        recipient_name=recipient.name or recipient.first_name or "Hiring Manager",
        recipient_title=recipient.title or "Recruiter",
        company_name=recipient.company_name,
        department=recipient.department or "Not specified",
        target_role_info=target_info,
        email_type=email_type,
        tone=tone,
        max_words=max_words,
    )

    try:
        ai_resp = await model.generate_content_async(
            prompt,
            generation_config={"temperature": 0.8},
        )

        content = _clean_ai_json(ai_resp.text)
        data = json.loads(content)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON. Please retry.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Email generation failed: {str(exc)}")

    body_plain = data.get("body_plain", "")
    word_count = len(body_plain.split())

    generated = GeneratedEmail(
        subject_line=data.get("subject_line", ""),
        body_html=data.get("body_html", ""),
        body_plain=body_plain,
        word_count=word_count,
        personalization_notes=data.get("personalization_notes", []),
        suggested_send_time=data.get("suggested_send_time"),
    )

    return GenerateEmailResponse(
        status="success",
        email=generated,
        recipient_name=recipient.name or recipient.first_name,
        recipient_email=recipient.email,
    )


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/outreach/generate-email", response_model=GenerateEmailResponse)
async def generate_cold_email(body: GenerateEmailRequest):
    """
    Generate a single personalized cold outreach email using Gemini AI.
    
    Supports three email types:
      - cold_intro: Direct introduction to a recruiter/hiring manager
      - referral_request: Ask for a referral or introduction
      - informational_interview: Request an informational chat
    """
    return await _generate_single_email(
        sender=body.sender,
        recipient=body.recipient,
        target_role=body.target_role,
        tone=body.tone,
        email_type=body.email_type,
        max_words=body.max_words,
    )


@router.post("/outreach/generate-email/batch", response_model=BatchEmailResponse)
async def generate_batch_emails(body: BatchEmailRequest):
    """
    Generate personalized cold emails for multiple contacts at once.
    Useful after finding contacts via /api/outreach/find-contacts (P6.1).
    
    Each email is uniquely personalized based on the recipient's name,
    title, and company — no copy-paste templates.
    """
    import asyncio

    if len(body.recipients) > 20:
        raise HTTPException(
            status_code=400,
            detail="Maximum 20 recipients per batch to avoid rate limits."
        )

    tasks = [
        _generate_single_email(
            sender=body.sender,
            recipient=recipient,
            target_role=body.target_role,
            tone=body.tone,
            email_type=body.email_type,
            max_words=body.max_words,
        )
        for recipient in body.recipients
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    emails: List[GenerateEmailResponse] = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            # Create a fallback error response
            emails.append(GenerateEmailResponse(
                status=f"failed: {str(result)}",
                email=GeneratedEmail(
                    subject_line="",
                    body_html="",
                    body_plain="",
                    word_count=0,
                    personalization_notes=[],
                ),
                recipient_name=body.recipients[i].name,
                recipient_email=body.recipients[i].email,
            ))
        else:
            emails.append(result)

    successful = sum(1 for e in emails if e.status == "success")

    return BatchEmailResponse(
        status=f"completed ({successful}/{len(emails)} successful)",
        emails=emails,
        total_generated=successful,
    )


@router.post("/outreach/generate-followup", response_model=FollowUpResponse)
async def generate_followup_email(body: FollowUpRequest):
    """
    Generate a follow-up email for a previously sent cold email.
    
    Supports up to 3 follow-ups with different strategies:
      - 1st: Add new value (article, achievement, company news)
      - 2nd: Shorter bump with a new angle
      - 3rd: "Closing the loop" — give them an easy out
    """
    if body.followup_number > 3:
        raise HTTPException(
            status_code=400,
            detail="Maximum 3 follow-ups recommended. Beyond that, move on."
        )

    prompt = FOLLOWUP_PROMPT.format(
        sender_name=body.sender.full_name,
        sender_title=body.sender.current_title or "Professional",
        recipient_name=body.recipient.name or body.recipient.first_name or "there",
        company_name=body.recipient.company_name,
        recipient_title=body.recipient.title or "Recruiter",
        original_subject=body.original_subject,
        original_snippet=body.original_body_snippet[:200],
        days_since=body.days_since_sent,
        followup_number=body.followup_number,
        tone=body.tone,
    )

    try:
        ai_resp = await model.generate_content_async(
            prompt,
            generation_config={"temperature": 0.7},
        )

        content = _clean_ai_json(ai_resp.text)
        data = json.loads(content)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON. Please retry.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Follow-up generation failed: {str(exc)}")

    body_plain = data.get("body_plain", "")

    return FollowUpResponse(
        status="success",
        subject_line=data.get("subject_line", f"Re: {body.original_subject}"),
        body_html=data.get("body_html", ""),
        body_plain=body_plain,
        word_count=len(body_plain.split()),
    )
