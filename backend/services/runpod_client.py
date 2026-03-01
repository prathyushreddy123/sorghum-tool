"""RunPod Serverless API client for triggering training jobs."""
import logging

import httpx

from config import settings

logger = logging.getLogger(__name__)

RUNPOD_API_URL = "https://api.runpod.ai/v2"


async def trigger_training(
    job_id: int,
    crop: str,
    trait_name: str,
    training_manifest_url: str,
    callback_url: str,
    config: dict | None = None,
) -> str:
    """Trigger a RunPod serverless training job. Returns RunPod job ID."""
    endpoint_id = settings.RUNPOD_ENDPOINT_ID
    api_key = settings.RUNPOD_API_KEY

    if not endpoint_id or not api_key:
        raise RuntimeError("RunPod not configured: set RUNPOD_ENDPOINT_ID and RUNPOD_API_KEY")

    payload = {
        "input": {
            "job_id": job_id,
            "crop": crop,
            "trait_name": trait_name,
            "training_manifest_url": training_manifest_url,
            "callback_url": callback_url,
            "callback_secret": settings.TRAINING_CALLBACK_SECRET,
            "config": config or {},
        },
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{RUNPOD_API_URL}/{endpoint_id}/run",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    runpod_job_id = data["id"]
    logger.info("RunPod job dispatched: %s for %s/%s", runpod_job_id, crop, trait_name)
    return runpod_job_id


async def check_job_status(runpod_job_id: str) -> dict:
    """Poll RunPod job status (fallback if webhook doesn't fire)."""
    endpoint_id = settings.RUNPOD_ENDPOINT_ID
    api_key = settings.RUNPOD_API_KEY

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{RUNPOD_API_URL}/{endpoint_id}/status/{runpod_job_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        resp.raise_for_status()
        return resp.json()
