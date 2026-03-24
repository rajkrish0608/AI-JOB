import os
import json
import pdfplumber
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from auth import get_current_user
import google.generativeai as genai
from gemini_retry import generate_with_retry
import os

router = APIRouter()

# Initialize Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-1.5-flash")

RESUME_EXTRACTION_PROMPT = """
You are an expert AI recruiter and data extractor.
Analyze the following resume text and extract the information into a structured JSON payload.
The JSON must adhere EXACTLY to the following keys and data types.
If a piece of information is missing from the resume, use null or an empty array/string as appropriate.

EXPECTED JSON SCHEMA:
{
  "first_name": "string",
  "last_name": "string",
  "phone": "string",
  "location_city": "string",
  "location_state": "string",
  "location_country": "string",
  "linkedin_url": "string",
  "github_url": "string",
  "portfolio_url": "string",
  "education": [
    {
      "education_level": "string (e.g., Bachelor's, Master's, High School)",
      "institution": "string",
      "field_of_study": "string",
      "grade": "string",
      "year_start": "string (YYYY)",
      "year_end": "string (YYYY)",
      "additional_info": "string"
    }
  ],
  "skills": ["string", "string"],
  "experience": [
    {
      "position": "string",
      "company": "string",
      "period": "string (e.g., Jan 2020 - Present)",
      "location": "string",
      "industry": "string",
      "responsibilities": ["string", "string"],
      "skills_acquired": ["string", "string"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "tech_stack": ["string"],
      "link": "string",
      "highlights": ["string"]
    }
  ],
  "achievements": [
    {
      "name": "string",
      "description": "string",
      "date": "string"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string",
      "description": "string",
      "url": "string"
    }
  ],
  "languages": [
    {
      "language": "string",
      "proficiency": "string"
    }
  ]
}

RESUME TEXT:
{resume_text}

IMPORTANT:
1. Return ONLY valid JSON, starting with { and ending with }.
2. Do not include markdown formatting or explanations.
"""

@router.post("/parse-resume")
async def parse_resume(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        # Extract text using pdfplumber
        text = ""
        with pdfplumber.open(file.file) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF.")

        # Call Gemini to parse the text into structured JSON
        prompt = f"You are an extraction API that only outputs valid JSON.\n\n{RESUME_EXTRACTION_PROMPT.replace('{resume_text}', text)}"
        response = await generate_with_retry(
            model,
            prompt,
            generation_config={"temperature": 0.0, "max_output_tokens": 4096},
        )

        try:
            # Safely parse the JSON returned by Gemini
            content = response.text.strip()
            # Remove markdown if model hallucinates it despite system prompt
            if content.startswith("```json"):
                content = content[7:-3].strip()
            parsed_json = json.loads(content)
            return {"status": "success", "data": parsed_json}
        except json.JSONDecodeError:
            print(f"Failed to decode JSON: {response.content[0].text}")
            raise HTTPException(status_code=500, detail="Failed to parse resume into structured format.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing resume: {str(e)}")
