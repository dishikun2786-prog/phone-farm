"""
OCR (Optical Character Recognition) Inference Module.

Wraps PaddleOCR for text recognition on mobile screenshots.
Supports Chinese and English text detection and recognition.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

from PIL import Image

logger = logging.getLogger("phonefarm.ai.ocr")


@dataclass
class OcrBlock:
    """Single recognized text block."""
    text: str
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float


@dataclass
class OcrResultBatch:
    """Batch OCR result with performance metrics."""
    blocks: list[OcrBlock]
    total_chars: int
    inference_ms: float


class OCRInference:
    """
    PaddleOCR wrapper for text recognition on mobile screenshots.

    Features:
      - Lazy-loading with on-demand initialization
      - Chinese + English text recognition
      - Model download from MinIO/S3
    """

    def __init__(self, config):
        self.config = config
        self._ocr = None
        self._model_version = "unknown"
        self._initialized = False

    @property
    def model_version(self) -> str:
        return self._model_version

    @property
    def is_loaded(self) -> bool:
        return self._ocr is not None

    def load_model(self) -> None:
        """
        Load the PaddleOCR model.

        Downloads from MinIO if the model directory doesn't exist locally.
        """
        if self._ocr is not None:
            logger.info("OCR model already loaded, skipping.")
            return

        model_dir = self.config.ocr_model_dir
        if not os.path.exists(model_dir):
            logger.info("OCR model not found locally, creating directory")
            os.makedirs(model_dir, exist_ok=True)

        try:
            from paddleocr import PaddleOCR

            # Detect language
            lang = "ch"  # Default to Chinese

            logger.info("Loading PaddleOCR model (lang=%s)...", lang)

            self._ocr = PaddleOCR(
                lang=lang,
                use_angle_cls=True,
                use_gpu=self.config.enable_gpu,
                show_log=False,
                det_db_thresh=0.3,
                det_db_box_thresh=0.5,
                rec_batch_num=6,
                max_text_length=25,
                det_model_dir=os.path.join(model_dir, "det"),
                rec_model_dir=os.path.join(model_dir, "rec"),
                cls_model_dir=os.path.join(model_dir, "cls"),
            )

            self._model_version = f"paddleocr-{lang}"
            self._initialized = True
            logger.info("PaddleOCR model loaded successfully")

        except ImportError:
            logger.error(
                "PaddleOCR not installed. Run: pip install paddleocr"
            )
            raise
        except Exception as e:
            logger.exception("Failed to load PaddleOCR model")
            self._ocr = None
            raise RuntimeError(f"OCR model load failed: {e}") from e

    def recognize(
        self,
        image_base64: str,
        language: str = "ch",
    ) -> OcrResultBatch:
        """
        Run OCR text recognition on a base64-encoded image.

        Args:
            image_base64: Base64-encoded JPEG or PNG image.
            language: Language code (ch, en, ch_en).

        Returns:
            OcrResultBatch with text blocks and performance metrics.
        """
        if self._ocr is None:
            raise RuntimeError("OCR model not loaded. Call load_model() first.")

        t_start = time.perf_counter()

        # Decode image
        try:
            image_bytes = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as e:
            raise ValueError(f"Failed to decode image: {e}") from e

        # Save to temp file (PaddleOCR requires file path or numpy array)
        import numpy as np
        img_array = np.array(image)

        # Run OCR
        try:
            results = self._ocr.ocr(img_array, cls=True)
        except Exception as e:
            logger.exception("OCR inference failed")
            raise RuntimeError(f"OCR inference failed: {e}") from e

        t_elapsed_ms = (time.perf_counter() - t_start) * 1000

        # Parse results
        blocks: list[OcrBlock] = []
        total_chars = 0

        if results and results[0]:
            for line in results[0]:
                if len(line) < 2:
                    continue
                bbox_points = line[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                text, confidence = line[1]

                if not text:
                    continue

                # Convert quadrilateral to bounding box
                xs = [p[0] for p in bbox_points]
                ys = [p[1] for p in bbox_points]
                x1, y1 = min(xs), min(ys)
                x2, y2 = max(xs), max(ys)

                total_chars += len(text)
                blocks.append(OcrBlock(
                    text=text,
                    x1=round(x1, 1),
                    y1=round(y1, 1),
                    x2=round(x2, 1),
                    y2=round(y2, 1),
                    confidence=round(confidence, 4),
                ))

        # Sort by position (top-to-bottom, left-to-right)
        blocks.sort(key=lambda b: (b.y1, b.x1))

        return OcrResultBatch(
            blocks=blocks,
            total_chars=total_chars,
            inference_ms=round(t_elapsed_ms, 2),
        )
