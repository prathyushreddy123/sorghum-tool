"""
RunPod Serverless handler for model training.

This handler runs on a GPU-equipped RunPod worker. It:
1. Downloads training data manifest from Supabase Storage
2. Downloads training images
3. Runs MobileNetV3 2-phase fine-tuning
4. Exports ONNX model with INT8 quantization
5. Uploads model to Supabase Storage
6. Sends callback to Railway backend with metrics
"""
import json
import os
import traceback

import httpx
import runpod
from supabase import create_client

from train_logic import run_training


def handler(event: dict) -> dict:
    """RunPod serverless handler."""
    input_data = event.get("input", {})

    job_id = input_data["job_id"]
    crop = input_data["crop"]
    trait_name = input_data["trait_name"]
    training_manifest_url = input_data["training_manifest_url"]
    callback_url = input_data["callback_url"]
    callback_secret = input_data.get("callback_secret", "")
    config = input_data.get("config", {})

    # Supabase credentials from env
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_KEY"]

    try:
        # 1. Download training manifest
        print(f"Downloading training manifest from {training_manifest_url}")
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(training_manifest_url)
            resp.raise_for_status()
            manifest = resp.json()

        # 2. Train model
        output_path = f"/tmp/{crop}_{trait_name}_model.onnx"
        metrics = run_training(manifest, output_path, config=config)

        # 3. Upload ONNX model to Supabase Storage
        supabase = create_client(supabase_url, supabase_key)
        version = metrics.get("version", 1)
        storage_path = f"{crop}/{trait_name}/model-v{version}.onnx"

        with open(output_path, "rb") as f:
            model_bytes = f.read()

        supabase.storage.from_("models").upload(
            storage_path, model_bytes,
            {"content-type": "application/octet-stream", "upsert": "true"},
        )

        model_url = supabase.storage.from_("models").get_public_url(storage_path)
        print(f"Model uploaded to {model_url}")

        # 4. Send callback to Railway
        callback_payload = {
            "success": True,
            "model_url": model_url,
            "metrics": metrics,
            "secret": callback_secret,
        }

        with httpx.Client(timeout=30.0) as client:
            resp = client.post(callback_url, json=callback_payload)
            print(f"Callback response: {resp.status_code}")

        return {
            "status": "completed",
            "model_url": model_url,
            "val_accuracy": metrics["val_accuracy"],
            "model_size_mb": metrics["model_size_mb"],
        }

    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        print(f"Training failed: {error_msg}")

        # Send failure callback
        try:
            with httpx.Client(timeout=10.0) as client:
                client.post(callback_url, json={
                    "success": False,
                    "error_message": error_msg[:2000],
                    "secret": callback_secret,
                })
        except Exception:
            pass

        return {"status": "failed", "error": error_msg[:500]}


runpod.serverless.start({"handler": handler})
