from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Union, Any
from datetime import datetime, timedelta
import random

router = APIRouter()

class ScheduledJob(BaseModel):
    platform: str
    job_url: str
    auth_cookies: Union[str, Dict[str, str]]
    profile: Dict[str, Any]

class BulkScheduleRequest(BaseModel):
    jobs: List[ScheduledJob]
    interval_minutes_min: int = Field(default=5, ge=1)
    interval_minutes_max: int = Field(default=15, ge=1)
    start_delay_minutes: int = Field(default=0, ge=0)

@router.post("/apply/schedule/bulk")
async def schedule_bulk_apply(request: Request, body: BulkScheduleRequest):
    """
    Schedules multiple job applications with staggered delays to mimic human behavior
    and avoid rate limiting/anti-bot detection.
    """
    redis = getattr(request.app.state, "redis", None)
    if not redis:
        raise HTTPException(status_code=500, detail="Redis connection pool not initialized")

    queued_jobs = []
    current_delay = body.start_delay_minutes

    for i, job_data in enumerate(body.jobs):
        task_name = f"task_apply_{job_data.platform.lower()}"
        
        # Calculate delay for this specific job
        # We add some randomness to the interval
        if i > 0:
            current_delay += random.randint(body.interval_minutes_min, body.interval_minutes_max)
        
        try:
            # Enqueue with a delay
            job = await redis.enqueue_job(
                task_name,
                job_data.job_url,
                job_data.auth_cookies,
                job_data.profile,
                _defer_by=timedelta(minutes=current_delay)
            )
            
            queued_jobs.append({
                "job_id": job.job_id,
                "platform": job_data.platform,
                "scheduled_for": (datetime.now() + timedelta(minutes=current_delay)).isoformat()
            })
        except Exception as e:
            # If one fails, we continue with others but log it
            print(f"Failed to schedule job {i}: {str(e)}")

    return {
        "status": "scheduled",
        "total_queued": len(queued_jobs),
        "jobs": queued_jobs,
        "message": f"Successfully staggered {len(queued_jobs)} applications over approximately {current_delay} minutes."
    }

@router.post("/apply/schedule/cancel/{job_id}")
async def cancel_scheduled_job(request: Request, job_id: str):
    """
    Cancels a scheduled job if it hasn't started yet.
    """
    redis = getattr(request.app.state, "redis", None)
    if not redis:
        raise HTTPException(status_code=500, detail="Redis connection pool not initialized")

    from arq.jobs import Job
    job = Job(job_id, redis)
    
    # Simple abort/cancel - arq doesn't have a direct "delete from queue" if not yet run 
    # but we can check if it's deferred.
    status = await job.status()
    if status.value == "deferred":
        # In arq, you can't easily "remove" a job once enqueued without worker-side filtering
        # but for this MVP, we acknowledge it.
        return {"status": "cancelled_requested", "job_id": job_id, "note": "Job is deferred and will be ignored if worker checks cancel-list (to be implemented)"}
    
    return {"status": "cannot_cancel", "current_status": status.value}
