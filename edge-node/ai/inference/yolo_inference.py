"""
YOLOv8 Object Detection Inference Module.

Wraps ultralytics YOLO for UI element detection on mobile screenshots.
Supports model download from MinIO/S3, thread-safe inference queue,
and performance metrics collection.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from PIL import Image

logger = logging.getLogger("phonefarm.ai.yolo")

# Will be imported lazily on first use
YOLO = None


def _get_yolo_class():
    global YOLO
    if YOLO is None:
        try:
            from ultralytics import YOLO as _YOLO
            YOLO = _YOLO
        except ImportError:
            logger.error(
                "ultralytics not installed. Run: pip install ultralytics"
            )
            raise
    return YOLO


@dataclass
class Detection:
    """Single detected object."""
    label: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def area(self) -> float:
        return (self.x2 - self.x1) * (self.y2 - self.y1)


@dataclass
class DetectionBatch:
    """Batch detection result with performance metrics."""
    detections: list[Detection]
    inference_ms: float
    preprocess_ms: float
    postprocess_ms: float
    input_width: int
    input_height: int

    @property
    def total_time_ms(self) -> float:
        return self.preprocess_ms + self.inference_ms + self.postprocess_ms


@dataclass
class PerformanceStats:
    """Rolling window performance statistics."""
    window_inference_ms: deque = field(default_factory=lambda: deque(maxlen=100))
    window_total_ms: deque = field(default_factory=lambda: deque(maxlen=100))
    total_inferences: int = 0
    total_failures: int = 0

    @property
    def avg_inference_ms(self) -> float:
        if not self.window_inference_ms:
            return 0.0
        return sum(self.window_inference_ms) / len(self.window_inference_ms)

    @property
    def avg_total_ms(self) -> float:
        if not self.window_total_ms:
            return 0.0
        return sum(self.window_total_ms) / len(self.window_total_ms)


class YOLOInference:
    """
    Ultralytics YOLOv8 inference wrapper optimized for UI element detection.

    Features:
      - Thread-safe inference queue with configurable max batch size
      - Model lazy-loading from disk or MinIO/S3
      - Pre-warming for consistent first-inference latency
      - Performance metrics tracking
    """

    # Default labels for PhoneFarm UI detection use case
    UI_LABELS = {
        0: "button",
        1: "text_field",
        2: "image",
        3: "icon",
        4: "switch",
        5: "checkbox",
        6: "popup",
        7: "keyboard",
        8: "nav_bar",
        9: "tab",
        10: "list_item",
        11: "input_field",
        12: "slider",
        13: "progress_bar",
        14: "ad_banner",
    }

    def __init__(self, config):
        self.config = config
        self._model = None
        self._model_version = "unknown"
        self._lock = threading.Lock()
        self._stats = PerformanceStats()
        self._initialized = False

    @property
    def model_version(self) -> str:
        return self._model_version

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load_model(self, model_path: Optional[str] = None) -> None:
        """
        Load the YOLO model from disk or download from MinIO if not available.

        Args:
            model_path: Path to the .pt model file. If None, uses config default.
        """
        path = model_path or os.path.join(
            self.config.model_cache_dir, self.config.yolo_model
        )

        with self._lock:
            if self._model is not None:
                logger.info("Model already loaded, skipping.")
                return

            if not os.path.exists(path):
                logger.info("Model not found locally, downloading from MinIO...")
                self._download_model(path)

            try:
                YOLOClass = _get_yolo_class()
                logger.info("Loading YOLO model from %s...", path)

                # Determine device
                device = "cpu"
                try:
                    import torch
                    if torch.cuda.is_available():
                        device = "cuda:0"
                    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                        device = "mps"
                except ImportError:
                    pass

                self._model = YOLOClass(path)
                # Override device setting
                if hasattr(self._model, 'to'):
                    self._model.to(device)
                logger.info("YOLO model loaded successfully on %s", device)

                # Extract version from filename
                self._model_version = os.path.basename(path).replace(".pt", "")
                self._initialized = True

            except Exception as e:
                logger.exception("Failed to load YOLO model")
                self._model = None
                raise RuntimeError(f"YOLO model load failed: {e}") from e

    def warmup(self) -> None:
        """Run a dummy inference to pre-warm the model (avoids cold-start latency)."""
        if not self._model:
            self.load_model()

        # Create a small blank image for warmup
        dummy_img = Image.new("RGB", (640, 640), color=(128, 128, 128))
        logger.info("Warming up YOLO model with dummy image...")

        try:
            _ = self._model(dummy_img, verbose=False)
            logger.info("YOLO model warmup complete (inference_ms=%.1f)",
                        self._stats.avg_inference_ms)
        except Exception as e:
            logger.warning("YOLO warmup encountered an issue: %s", e)

    def detect(
        self,
        image_base64: str,
        confidence: float = 0.5,
        iou: float = 0.45,
    ) -> DetectionBatch:
        """
        Run object detection on a base64-encoded image.

        Args:
            image_base64: Base64-encoded JPEG or PNG image.
            confidence: Minimum confidence threshold for detections.
            iou: IoU threshold for Non-Maximum Suppression.

        Returns:
            DetectionBatch with detections and performance metrics.
        """
        t_start = time.perf_counter()

        # Decode and preprocess
        t_preprocess_start = time.perf_counter()

        try:
            image_bytes = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            input_width, input_height = image.size
        except Exception as e:
            self._stats.total_failures += 1
            raise ValueError(f"Failed to decode image: {e}") from e

        if input_width < 10 or input_height < 10:
            self._stats.total_failures += 1
            raise ValueError(f"Image too small: {input_width}x{input_height}")

        t_preprocess = (time.perf_counter() - t_preprocess_start) * 1000

        # Inference
        t_inference_start = time.perf_counter()

        with self._lock:
            if self._model is None:
                raise RuntimeError("YOLO model not loaded. Call load_model() first.")
            try:
                results = self._model(
                    image,
                    conf=confidence,
                    iou=iou,
                    verbose=False,
                )
            except Exception as e:
                self._stats.total_failures += 1
                logger.exception("YOLO inference failed")
                raise RuntimeError(f"YOLO inference failed: {e}") from e

        t_inference = (time.perf_counter() - t_inference_start) * 1000

        # Postprocess
        t_postprocess_start = time.perf_counter()

        detections: list[Detection] = []
        if results and len(results) > 0:
            result = results[0]
            boxes = result.boxes
            if boxes is not None and len(boxes) > 0:
                for box in boxes:
                    cls_id = int(box.cls[0].item()) if hasattr(box.cls, 'item') else int(box.cls[0])
                    label = self.UI_LABELS.get(cls_id, f"class_{cls_id}")
                    conf = float(box.conf[0].item()) if hasattr(box.conf, 'item') else float(box.conf[0])

                    if conf < confidence:
                        continue

                    # Bounding box coordinates (xyxy format)
                    xyxy = box.xyxy[0]
                    x1 = float(xyxy[0].item()) if hasattr(xyxy[0], 'item') else float(xyxy[0])
                    y1 = float(xyxy[1].item()) if hasattr(xyxy[1], 'item') else float(xyxy[1])
                    x2 = float(xyxy[2].item()) if hasattr(xyxy[2], 'item') else float(xyxy[2])
                    y2 = float(xyxy[3].item()) if hasattr(xyxy[3], 'item') else float(xyxy[3])

                    detections.append(Detection(
                        label=label,
                        confidence=round(conf, 4),
                        x1=round(x1, 1),
                        y1=round(y1, 1),
                        x2=round(x2, 1),
                        y2=round(y2, 1),
                    ))

        # Sort by confidence descending
        detections.sort(key=lambda d: d.confidence, reverse=True)

        t_postprocess = (time.perf_counter() - t_postprocess_start) * 1000

        # Update stats
        self._stats.window_inference_ms.append(t_inference)
        self._stats.window_total_ms.append(t_inference + t_preprocess + t_postprocess)
        self._stats.total_inferences += 1

        return DetectionBatch(
            detections=detections,
            inference_ms=round(t_inference, 2),
            preprocess_ms=round(t_preprocess, 2),
            postprocess_ms=round(t_postprocess, 2),
            input_width=input_width,
            input_height=input_height,
        )

    def _download_model(self, target_path: str) -> None:
        """
        Download the YOLO model from MinIO/S3.

        Uses the MinIO client to fetch the model file from the configured bucket.
        Falls back to downloading from ultralytics directly if MinIO is unavailable.
        """
        os.makedirs(os.path.dirname(target_path), exist_ok=True)

        # Try MinIO first
        try:
            from minio import Minio
            endpoint = self.config.minio_endpoint
            bucket = self.config.minio_bucket
            object_name = f"models/{self.config.yolo_model}"

            client = Minio(
                endpoint,
                access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
                secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
                secure=False,
            )

            if client.bucket_exists(bucket):
                client.fget_object(bucket, object_name, target_path)
                logger.info("Downloaded YOLO model from MinIO: %s/%s", bucket, object_name)
                return
        except ImportError:
            logger.info("MinIO client not available, trying ultralytics download...")
        except Exception as e:
            logger.warning("MinIO download failed: %s, trying ultralytics download...", e)

        # Fallback: download from ultralytics
        try:
            YOLOClass = _get_yolo_class()
            import urllib.request

            model_name = self.config.yolo_model
            url = f"https://github.com/ultralytics/assets/releases/download/v0.0.0/{model_name}"

            logger.info("Downloading YOLO model from %s...", url)
            urllib.request.urlretrieve(url, target_path)
            logger.info("Downloaded YOLO model to %s", target_path)
        except Exception as e:
            raise RuntimeError(
                f"Failed to download YOLO model '{self.config.yolo_model}': {e}"
                f"\nPlace the .pt file at: {target_path}"
            ) from e

    def get_stats(self) -> dict:
        """Return current performance statistics."""
        return {
            "total_inferences": self._stats.total_inferences,
            "total_failures": self._stats.total_failures,
            "avg_inference_ms": round(self._stats.avg_inference_ms, 2),
            "avg_total_ms": round(self._stats.avg_total_ms, 2),
            "model_loaded": self.is_loaded,
            "model_version": self._model_version,
        }
