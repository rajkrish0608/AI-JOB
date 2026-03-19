from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Any

router = APIRouter()

class EnqueueRequest(BaseModel):
    platform: str
    job_url: str
    auth_cookies: dict | str  # string for linkedin (li_at), dict for others
    profile: dict

@router.post("/apply/queue")
async def enqueue_application(request: Request, body: EnqueueRequest):
    """
    Enqueues a job application task to the Redis background worker.
    """
    redis = getattr(request.app.state, "redis", None)
    if not redis:
        raise HTTPException(status_code=500, detail="Redis connection pool not initialized")

    task_name = f"task_apply_{body.platform.lower()}"
    valid_tasks = ["task_apply_linkedin", "task_apply_naukri", "task_apply_indeed", "task_apply_internshala"]
    
    if task_name not in valid_tasks:
        raise HTTPException(status_code=400, detail=f"Invalid platform. Must be one of: linkedin, naukri, indeed, internshala")

    try:
        # Enqueue job
        job = await redis.enqueue_job(
            task_name,
            body.job_url,
            body.auth_cookies,
            body.profile
        )
        return {
            "status": "queued",
            "job_id": job.job_id,
            "platform": body.platform,
            "message": f"Successfully queued application for {body.platform}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/apply/queue/{job_id}")
async def get_queue_status(request: Request, job_id: str):
    """
    Check the status of a queued application task.
    """
    redis = getattr(request.app.state, "redis", None)
    if not redis:
        raise HTTPException(status_code=500, detail="Redis connection pool not initialized")

    from arq.jobs import Job
    job = Job(job_id, redis)
    
    status = await job.status()
    info = await job.info()
    
    if not info:
        return {"job_id": job_id, "status": status.value}

    result_info = None
    if status.value == "complete":
        try:
            result_info = await job.result()
        except Exception as e:
            result_info = str(e)

    return {
        "job_id": job_id,
        "status": status.value,
        "enqueued_at": info.enqueue_time.isoformat() if info.enqueue_time else None,
        "function": info.function,
        "result": result_info
    }
