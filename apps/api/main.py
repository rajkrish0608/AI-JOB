from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os

# Load environment variables from the root .env file
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings
from arq import create_pool
from arq.connections import RedisSettings
from utils import get_redis_settings

class Settings(BaseSettings):
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_env: str = "development"

settings = Settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize background task queue pool
    redis_settings = get_redis_settings()
    app.state.redis = await create_pool(redis_settings)
    yield
    # Cleanup on shutdown
    await app.state.redis.close()

app = FastAPI(
    title="AI Job Apply API",
    description="Backend API for AI Job Apply platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
from routers import (
    resume, linkedin, portfolio,
    jobs_linkedin, jobs_naukri, jobs_indeed,
    jobs_glassdoor, jobs_internshala,
    jobs_aggregator, jobs_scorer,
    resume_builder, resume_renderer, resume_pdf,
    cover_letter,
    apply_linkedin, apply_naukri, apply_indeed, apply_internshala,
    apply_queue, apply_scheduler,
    hr_email_finder, cold_email, gmail_sender,
    dream_companies,
)

# CORS configuration — restrict to known origins
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "").split(",") if os.environ.get("ALLOWED_ORIGINS") else [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://ai-job-amber.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume.router, prefix="/api", tags=["resume"])
app.include_router(linkedin.router, prefix="/api", tags=["linkedin"])
app.include_router(portfolio.router, prefix="/api", tags=["portfolio"])
# Aggregator FIRST so its /api/jobs/aggregate route isn't shadowed
app.include_router(jobs_aggregator.router, prefix="/api", tags=["jobs"])
app.include_router(jobs_scorer.router, prefix="/api", tags=["jobs"])
app.include_router(jobs_linkedin.router, prefix="/api", tags=["jobs"])
app.include_router(jobs_naukri.router, prefix="/api", tags=["jobs"])
app.include_router(jobs_indeed.router, prefix="/api", tags=["jobs"])
app.include_router(jobs_glassdoor.router, prefix="/api", tags=["jobs"])
app.include_router(jobs_internshala.router, prefix="/api", tags=["jobs"])
app.include_router(resume_builder.router, prefix="/api", tags=["resume"])
app.include_router(resume_renderer.router, prefix="/api", tags=["resume"])
app.include_router(resume_pdf.router, prefix="/api", tags=["resume"])
app.include_router(cover_letter.router, prefix="/api", tags=["resume"])
app.include_router(apply_linkedin.router, prefix="/api", tags=["apply"])
app.include_router(apply_indeed.router, prefix="/api", tags=["apply"])
app.include_router(apply_internshala.router, prefix="/api", tags=["apply"])
app.include_router(apply_queue.router, prefix="/api", tags=["apply", "queue"])
app.include_router(apply_scheduler.router, prefix="/api", tags=["apply", "scheduler"])
app.include_router(hr_email_finder.router, prefix="/api", tags=["outreach"])
app.include_router(cold_email.router, prefix="/api", tags=["outreach"])
app.include_router(gmail_sender.router, prefix="/api", tags=["outreach"])
app.include_router(dream_companies.router, prefix="/api", tags=["companies"])

@app.get("/health")
async def health_check():
    """Health check endpoint to verify the API is running."""
    return {
        "status": "ok",
        "environment": settings.api_env,
        "version": app.version
    }
