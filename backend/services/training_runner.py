"""Background training job runner.

Polls for queued training jobs and runs train_model.py as a subprocess.
Started as a daemon thread from FastAPI lifespan.
"""
import json
import logging
import os
import signal
import subprocess
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from database import SessionLocal
from models import TrainingJob

logger = logging.getLogger(__name__)

POLL_INTERVAL = 5  # seconds
SCRIPTS_DIR = Path(__file__).parent.parent / "scripts"
MANIFEST_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "models" / "manifest.json"
MODELS_DIR = Path(__file__).parent.parent.parent / "frontend" / "public" / "models"


class TrainingRunner:
    def __init__(self):
        self._stop_event = threading.Event()
        self._current_pid: int | None = None
        self._thread: threading.Thread | None = None

    def start(self):
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="training-runner")
        self._thread.start()
        logger.info("Training runner started")

    def stop(self):
        self._stop_event.set()
        self._kill_current()
        if self._thread:
            self._thread.join(timeout=10)
        logger.info("Training runner stopped")

    def _kill_current(self):
        pid = self._current_pid
        if pid:
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass

    def _run_loop(self):
        while not self._stop_event.is_set():
            try:
                self._poll_and_run()
            except Exception:
                logger.exception("Training runner error")
            self._stop_event.wait(POLL_INTERVAL)

    def _poll_and_run(self):
        db: Session = SessionLocal()
        try:
            job = db.query(TrainingJob).filter(
                TrainingJob.status == "queued"
            ).order_by(TrainingJob.created_at).first()

            if not job:
                return

            # Check if cancelled before starting
            db.refresh(job)
            if job.status != "queued":
                return

            job.status = "running"
            job.started_at = datetime.utcnow()
            db.commit()
            job_id = job.id
            trait_name = job.trait_name
            config = json.loads(job.config) if job.config else {}
        finally:
            db.close()

        # Run training in subprocess
        self._execute_training(job_id, trait_name, config)

    def _execute_training(self, job_id: int, trait_name: str, config: dict):
        output_path = str(MODELS_DIR / f"{trait_name}-v1.onnx")
        metrics_file = None

        try:
            metrics_fd, metrics_path = tempfile.mkstemp(suffix=".json", prefix="train_metrics_")
            os.close(metrics_fd)
            metrics_file = metrics_path

            cmd = [
                "python3", str(SCRIPTS_DIR / "train_model.py"),
                "--trait", trait_name,
                "--bootstrap",
                "--output", output_path,
                "--metrics-output", metrics_path,
            ]

            # Apply config overrides
            if "epochs_frozen" in config:
                cmd.extend(["--epochs-frozen", str(config["epochs_frozen"])])
            if "epochs_unfrozen" in config:
                cmd.extend(["--epochs-unfrozen", str(config["epochs_unfrozen"])])
            if "lr" in config:
                cmd.extend(["--lr", str(config["lr"])])
            if config.get("no_quantize"):
                cmd.append("--no-quantize")
            if "augment_factor" in config:
                cmd.extend(["--augment-factor", str(config["augment_factor"])])

            logger.info("Starting training: %s", " ".join(cmd))
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=str(SCRIPTS_DIR.parent),
            )
            self._current_pid = proc.pid

            stdout, _ = proc.communicate()
            self._current_pid = None

            # Check if job was cancelled while running
            db = SessionLocal()
            try:
                job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
                if not job or job.status == "cancelled":
                    logger.info("Job %d was cancelled during execution", job_id)
                    return

                if proc.returncode != 0:
                    output_text = stdout.decode("utf-8", errors="replace") if stdout else "No output"
                    job.status = "failed"
                    job.error_message = output_text[-2000:]  # last 2000 chars
                    job.completed_at = datetime.utcnow()
                    db.commit()
                    logger.error("Training job %d failed (exit %d)", job_id, proc.returncode)
                    return

                # Read metrics
                metrics = {}
                if os.path.exists(metrics_path):
                    with open(metrics_path) as f:
                        metrics = json.load(f)

                job.status = "completed"
                job.completed_at = datetime.utcnow()
                job.metrics = json.dumps(metrics)
                job.model_path = output_path
                db.commit()

                # Update manifest.json
                self._update_manifest(trait_name, output_path, metrics)
                logger.info("Training job %d completed successfully", job_id)
            finally:
                db.close()

        except Exception as e:
            logger.exception("Training job %d error: %s", job_id, e)
            db = SessionLocal()
            try:
                job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
                if job and job.status == "running":
                    job.status = "failed"
                    job.error_message = str(e)[:2000]
                    job.completed_at = datetime.utcnow()
                    db.commit()
            finally:
                db.close()
        finally:
            if metrics_file and os.path.exists(metrics_file):
                os.unlink(metrics_file)

    def _update_manifest(self, trait_name: str, model_path: str, metrics: dict):
        """Update manifest.json with new tier1 entry for the trained model."""
        try:
            if not MANIFEST_PATH.exists():
                logger.warning("manifest.json not found at %s", MANIFEST_PATH)
                return

            manifest = json.loads(MANIFEST_PATH.read_text())
            models_dict = manifest.get("models", {})
            trait_entry = models_dict.get(trait_name, {})

            # Build relative URL from MODELS_DIR
            rel_path = os.path.relpath(model_path, MODELS_DIR.parent)
            model_url = "/" + rel_path.replace("\\", "/")

            num_classes = metrics.get("num_classes", 5)
            classes = [str(i) for i in range(1, num_classes + 1)]

            # Preserve existing class_labels if present
            existing_tier1 = trait_entry.get("tier1") or {}
            class_labels = existing_tier1.get("class_labels")

            size_mb = metrics.get("model_size_mb", 0)
            accuracy = metrics.get("val_accuracy")

            trait_entry["tier1"] = {
                "url": model_url,
                "version": f"v1-trained-{datetime.utcnow().strftime('%Y%m%d')}",
                "size_mb": size_mb,
                "accuracy": accuracy,
                "classes": classes,
                "class_labels": class_labels,
                "input_size": 224,
                "confidence_threshold": existing_tier1.get("confidence_threshold", 0.70),
            }

            models_dict[trait_name] = trait_entry
            manifest["models"] = models_dict

            MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
            logger.info("Updated manifest.json for trait '%s'", trait_name)
        except Exception:
            logger.exception("Failed to update manifest.json")


# Singleton
_runner: TrainingRunner | None = None


def start_training_runner():
    global _runner
    if _runner is None:
        _runner = TrainingRunner()
        _runner.start()


def stop_training_runner():
    global _runner
    if _runner:
        _runner.stop()
        _runner = None
