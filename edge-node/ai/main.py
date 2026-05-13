"""
PhoneFarm Edge AI Inference Service.

FastAPI application providing on-device and edge-side AI inference:
  - YOLOv8 object detection (UI element detection)
  - PaddleOCR text recognition
  - LLM text generation (MNN Qwen2-0.5B / fallback to cloud API)
  - Federated learning model aggregation

Run:
    uvicorn ai.main:app --host 0.0.0.0 --port 9100
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

# ── Logging ──

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("phonefarm.ai")

# ── Configuration ──


@dataclass
class AppConfig:
    """Application configuration loaded from environment variables."""
    model_cache_dir: str = os.getenv("MODEL_CACHE_DIR", "./models")
    yolo_model: str = os.getenv("YOLO_MODEL", "yolov8n.pt")
    ocr_model_dir: str = os.getenv("OCR_MODEL_DIR", "./models/ocr")
    llm_model_path: str = os.getenv("LLM_MODEL_PATH", "./models/qwen2-0.5b.mnn")
    llm_tokenizer_path: str = os.getenv("LLM_TOKENIZER_PATH", "./models/qwen2-tokenizer")
    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    minio_bucket: str = os.getenv("MINIO_BUCKET", "phonefarm-models")
    cloud_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    cloud_api_base: str = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com/anthropic")
    request_timeout: int = int(os.getenv("REQUEST_TIMEOUT", "60"))
    max_image_size: int = int(os.getenv("MAX_IMAGE_SIZE", "4194304"))  # 4 MiB
    rate_limit_per_minute: int = int(os.getenv("RATE_LIMIT", "120"))
    cache_ttl: int = int(os.getenv("CACHE_TTL", "60"))
    enable_gpu: bool = os.getenv("ENABLE_GPU", "true").lower() == "true"


config = AppConfig()


# ── Model State ──

models_loaded: dict[str, bool] = {
    "yolo": False,
    "ocr": False,
    "llm": False,
}
model_versions: dict[str, str] = {}
model_load_errors: dict[str, Optional[str]] = {
    "yolo": None,
    "ocr": None,
    "llm": None,
}

# Lazy imports after config is set
yolo_inference = None
ocr_inference = None
llm_inference = None
federated_aggregator = None


def get_yolo():
    global yolo_inference
    if yolo_inference is None:
        from inference.yolo_inference import YOLOInference
        yolo_inference = YOLOInference(config)
    return yolo_inference


def get_ocr():
    global ocr_inference
    if ocr_inference is None:
        from inference.ocr_inference import OCRInference
        ocr_inference = OCRInference(config)
    return ocr_inference


def get_llm():
    global llm_inference
    if llm_inference is None:
        from inference.llm_inference import LLMInference
        llm_inference = LLMInference(config)
    return llm_inference


def get_federated():
    global federated_aggregator
    if federated_aggregator is None:
        from federated.aggregator import FederatedAggregator
        federated_aggregator = FederatedAggregator()
    return federated_aggregator


# ── Request/Response Models ──

class DetectionRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded image bytes")
    confidence: float = Field(0.5, ge=0.0, le=1.0, description="Detection confidence threshold")
    iou: float = Field(0.45, ge=0.0, le=1.0, description="NMS IoU threshold")

    @field_validator("image_base64")
    @classmethod
    def validate_image_size(cls, v: str) -> str:
        if len(v) > config.max_image_size * 2:  # base64 overhead approx 1.33x
            raise ValueError(f"Image too large: {len(v)} chars (max ~{config.max_image_size * 2})")
        return v


class DetectionBBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class DetectionResult(BaseModel):
    label: str
    confidence: float
    bbox: DetectionBBox
    area: float


class DetectionResponse(BaseModel):
    detections: list[DetectionResult]
    inference_time_ms: float
    model_version: str
    input_width: int
    input_height: int


class OCRRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded image bytes")
    language: str = Field("ch", description="Language code: ch, en, ch_en")

    @field_validator("image_base64")
    @classmethod
    def validate_image_size(cls, v: str) -> str:
        if len(v) > config.max_image_size * 2:
            raise ValueError(f"Image too large: {len(v)} chars")
        return v


class TextBlock(BaseModel):
    text: str
    bbox: DetectionBBox
    confidence: float


class OCRResponse(BaseModel):
    blocks: list[TextBlock]
    total_chars: int
    inference_time_ms: float


class LLMRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=8192, description="Input prompt")
    max_tokens: int = Field(256, ge=1, le=4096, description="Maximum tokens to generate")
    temperature: float = Field(0.7, ge=0.0, le=2.0, description="Sampling temperature")
    stream: bool = Field(False, description="Enable streaming response")

    @field_validator("prompt")
    @classmethod
    def sanitize_prompt(cls, v: str) -> str:
        return v.strip()


class LLMResponse(BaseModel):
    text: str
    tokens_used: int
    inference_time_ms: float
    finish_reason: str  # "stop", "length", "error"
    model_used: str


class ModelInfo(BaseModel):
    name: str
    loaded: bool
    version: Optional[str] = None
    error: Optional[str] = None


class ModelsListResponse(BaseModel):
    models: list[ModelInfo]
    gpu_available: bool
    gpu_device: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    models: dict[str, bool]
    uptime_seconds: float
    version: str


class ReloadRequest(BaseModel):
    model_name: str = Field(..., description="Model to reload: yolo, ocr, llm, all")


class ReloadResponse(BaseModel):
    success: bool
    model_name: str
    message: str


# ── Rate Limiter (in-memory sliding window) ──

class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = {}

    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        window = [t for t in self._requests.get(client_ip, []) if now - t < self.window_seconds]
        if len(window) >= self.max_requests:
            return False
        window.append(now)
        self._requests[client_ip] = window
        return True

    def cleanup(self) -> None:
        now = time.time()
        stale = []
        for ip, timestamps in self._requests.items():
            active = [t for t in timestamps if now - t < self.window_seconds]
            if active:
                self._requests[ip] = active
            else:
                stale.append(ip)
        for ip in stale:
            del self._requests[ip]


rate_limiter = RateLimiter(config.rate_limit_per_minute)


# ── Response Cache ──

class SimpleCache:
    """In-memory cache with TTL for identical inference requests."""

    def __init__(self, ttl_seconds: int = 60):
        self.ttl = ttl_seconds
        self._cache: dict[str, tuple[float, str]] = {}

    def get(self, key: str) -> Optional[str]:
        entry = self._cache.get(key)
        if entry is None:
            return None
        ts, value = entry
        if time.time() - ts > self.ttl:
            del self._cache[key]
            return None
        return value

    def set(self, key: str, value: str) -> None:
        self._cache[key] = (time.time(), value)

    def cleanup(self) -> None:
        now = time.time()
        stale = [k for k, (ts, _) in self._cache.items() if now - ts > self.ttl]
        for k in stale:
            del self._cache[k]


response_cache = SimpleCache(config.cache_ttl)


# ── App Lifecycle ──

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown logic."""
    logger.info("PhoneFarm Edge AI Service starting...")

    # Detect GPU
    gpu_info = detect_gpu()
    logger.info("GPU detection: %s", gpu_info)

    # Pre-warm models in background
    import asyncio
    asyncio.create_task(warmup_models())

    logger.info("Edge AI service ready on port %s", os.getenv("AI_PORT", "9100"))
    yield

    # Shutdown
    logger.info("Edge AI service shutting down...")
    if federated_aggregator is not None:
        federated_aggregator.save_checkpoint()


def detect_gpu() -> dict:
    """Detect available GPU devices."""
    try:
        import torch
        if torch.cuda.is_available():
            return {"type": "cuda", "device": torch.cuda.get_device_name(0), "count": torch.cuda.device_count()}
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return {"type": "mps", "device": "Apple Silicon", "count": 1}
    except ImportError:
        pass
    return {"type": "cpu", "device": "CPU", "count": 1}


async def warmup_models():
    """Pre-warm models on startup."""
    try:
        logger.info("Warming up YOLO model...")
        yolo = get_yolo()
        yolo.warmup()
        models_loaded["yolo"] = True
        model_versions["yolo"] = yolo.model_version
        logger.info("YOLO model warmup complete")
    except Exception as e:
        model_load_errors["yolo"] = str(e)
        logger.error("YOLO warmup failed: %s", e)

    try:
        logger.info("Loading LLM model (may take a while)...")
        llm = get_llm()
        await llm.load_model()
        models_loaded["llm"] = True
        model_versions["llm"] = llm.model_version
        logger.info("LLM model loaded")
    except Exception as e:
        model_load_errors["llm"] = str(e)
        logger.error("LLM load failed: %s", e)


# ── FastAPI Application ──

app = FastAPI(
    title="PhoneFarm Edge AI Service",
    version="0.1.0",
    description="On-device and edge-side AI inference for PhoneFarm",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Middleware ──

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"

    if not rate_limiter.is_allowed(client_ip):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"error": "Rate limit exceeded", "retry_after": 60},
        )

    response = await call_next(request)
    return response


# ── Health / Info Endpoints ──

@app.get("/v1/health", response_model=HealthResponse)
async def health_check():
    """Health check with model load status."""
    return HealthResponse(
        status="healthy" if all(models_loaded.values()) else "degraded",
        models=models_loaded,
        uptime_seconds=time.time() - start_time,
        version="0.1.0",
    )


@app.get("/v1/models", response_model=ModelsListResponse)
async def list_models():
    """List all available models with their load status."""
    gpu_info = detect_gpu()
    model_list = [
        ModelInfo(
            name="yolo",
            loaded=models_loaded.get("yolo", False),
            version=model_versions.get("yolo"),
            error=model_load_errors.get("yolo"),
        ),
        ModelInfo(
            name="ocr",
            loaded=models_loaded.get("ocr", False),
            version=model_versions.get("ocr"),
            error=model_load_errors.get("ocr"),
        ),
        ModelInfo(
            name="llm",
            loaded=models_loaded.get("llm", False),
            version=model_versions.get("llm"),
            error=model_load_errors.get("llm"),
        ),
    ]
    return ModelsListResponse(
        models=model_list,
        gpu_available=gpu_info["type"] != "cpu",
        gpu_device=gpu_info.get("device"),
    )


@app.post("/v1/models/reload", response_model=ReloadResponse)
async def reload_model(request: ReloadRequest):
    """Hot-reload a model without restarting the service."""
    model_name = request.model_name
    if model_name not in ("yolo", "ocr", "llm", "all"):
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_name}")

    targets = ["yolo", "ocr", "llm"] if model_name == "all" else [model_name]

    results = []
    for name in targets:
        try:
            if name == "yolo":
                yolo = get_yolo()
                yolo.load_model()
                models_loaded["yolo"] = True
                model_versions["yolo"] = yolo.model_version
                model_load_errors["yolo"] = None
            elif name == "ocr":
                ocr = get_ocr()
                ocr.load_model()
                models_loaded["ocr"] = True
                model_versions["ocr"] = ocr.model_version
                model_load_errors["ocr"] = None
            elif name == "llm":
                llm = get_llm()
                await llm.load_model()
                models_loaded["llm"] = True
                model_versions["llm"] = llm.model_version
                model_load_errors["llm"] = None
            results.append(f"{name}: reloaded")
        except Exception as e:
            model_load_errors[name] = str(e)
            results.append(f"{name}: failed - {e}")

    all_ok = all("failed" not in r for r in results)
    return ReloadResponse(
        success=all_ok,
        model_name=model_name,
        message="; ".join(results),
    )


# ── Inference Endpoints ──

@app.post("/v1/inference/yolo", response_model=DetectionResponse)
async def yolo_detect(request: DetectionRequest):
    """Run YOLOv8 object detection on an image."""
    if not models_loaded.get("yolo", False):
        raise HTTPException(status_code=503, detail="YOLO model not loaded")

    # Check cache
    cache_key = _make_cache_key("yolo", request.model_dump_json())
    cached = response_cache.get(cache_key)
    if cached:
        from fastapi.responses import Response
        return Response(content=cached, media_type="application/json")

    try:
        yolo = get_yolo()
        results = yolo.detect(
            image_base64=request.image_base64,
            confidence=request.confidence,
            iou=request.iou,
        )

        response = DetectionResponse(
            detections=[
                DetectionResult(
                    label=r.label,
                    confidence=r.confidence,
                    bbox=DetectionBBox(x1=r.x1, y1=r.y1, x2=r.x2, y2=r.y2),
                    area=r.area,
                )
                for r in results.detections
            ],
            inference_time_ms=results.inference_ms,
            model_version=yolo.model_version,
            input_width=results.input_width,
            input_height=results.input_height,
        )

        # Cache the response
        from fastapi.encoders import jsonable_encoder
        response_cache.set(cache_key, json.dumps(jsonable_encoder(response)))

        return response
    except Exception as e:
        logger.exception("YOLO inference failed")
        raise HTTPException(status_code=500, detail=f"YOLO inference error: {str(e)}")


@app.post("/v1/inference/ocr", response_model=OCRResponse)
async def ocr_recognize(request: OCRRequest):
    """Run PaddleOCR text recognition on an image."""
    try:
        ocr = get_ocr()
        if not models_loaded.get("ocr", False):
            ocr.load_model()
            models_loaded["ocr"] = True
            model_versions["ocr"] = ocr.model_version

        results = ocr.recognize(
            image_base64=request.image_base64,
            language=request.language,
        )

        return OCRResponse(
            blocks=[
                TextBlock(
                    text=block.text,
                    bbox=DetectionBBox(x1=block.x1, y1=block.y1, x2=block.x2, y2=block.y2),
                    confidence=block.confidence,
                )
                for block in results.blocks
            ],
            total_chars=results.total_chars,
            inference_time_ms=results.inference_ms,
        )
    except Exception as e:
        logger.exception("OCR inference failed")
        raise HTTPException(status_code=500, detail=f"OCR inference error: {str(e)}")


@app.post("/v1/inference/llm", response_model=LLMResponse)
async def llm_generate(request: LLMRequest):
    """Generate text using the local LLM (with cloud fallback)."""
    if request.stream:
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            stream_llm_response(request),
            media_type="text/event-stream",
        )

    try:
        llm = get_llm()
        if not models_loaded.get("llm", False):
            raise HTTPException(status_code=503, detail="LLM model not loaded. Set DEEPSEEK_API_KEY for cloud fallback.")

        result = await llm.generate(
            prompt=request.prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        )

        return LLMResponse(
            text=result.text,
            tokens_used=result.tokens_used,
            inference_time_ms=result.inference_time_ms,
            finish_reason=result.finish_reason,
            model_used=llm.model_version,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("LLM inference failed")
        raise HTTPException(status_code=500, detail=f"LLM inference error: {str(e)}")


async def stream_llm_response(request: LLMRequest):
    """Stream LLM generation tokens via SSE."""
    try:
        llm = get_llm()
        async for token in llm.generate_stream(
            prompt=request.prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        ):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


# ── Federated Learning Endpoint ──

class ModelUpdateRequest(BaseModel):
    device_id: str = Field(..., description="Device that produced this update")
    model_type: str = Field(..., description="Model type: yolo, llm")
    weights_base64: str = Field(..., description="Base64-encoded model weights")
    sample_count: int = Field(..., ge=1, description="Number of training samples used")
    metrics: dict = Field(default_factory=dict, description="Training metrics")

    @field_validator("model_type")
    @classmethod
    def validate_model_type(cls, v: str) -> str:
        if v not in ("yolo", "llm"):
            raise ValueError(f"Unknown model type: {v}")
        return v


class AggregateResponse(BaseModel):
    aggregated: bool
    total_updates: int
    participating_devices: list[str]


@app.post("/v1/federated/update")
async def submit_update(request: ModelUpdateRequest):
    """Submit a model weight update from a device for federated aggregation."""
    import base64

    try:
        weights = base64.b64decode(request.weights_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64-encoded weights")

    fed = get_federated()
    fed.add_update(
        device_id=request.device_id,
        model_type=request.model_type,
        weights=weights,
        sample_count=request.sample_count,
        metrics=request.metrics,
    )

    return {"status": "ok", "total_updates": fed.update_count()}


@app.post("/v1/federated/aggregate", response_model=AggregateResponse)
async def trigger_aggregation():
    """Trigger federated model aggregation."""
    fed = get_federated()
    if not fed.should_aggregate():
        return AggregateResponse(
            aggregated=False,
            total_updates=fed.update_count(),
            participating_devices=[],
        )

    device_ids = await fed.aggregate()
    return AggregateResponse(
        aggregated=True,
        total_updates=fed.update_count(),
        participating_devices=device_ids,
    )


@app.get("/v1/federated/status")
async def federated_status():
    """Get federated learning status."""
    fed = get_federated()
    return {
        "update_count": fed.update_count(),
        "last_aggregation": fed.last_aggregation_time().isoformat() if fed.last_aggregation_time() else None,
        "aggregation_ready": fed.should_aggregate(),
    }


# ── Helpers ──

start_time = time.time()


def _make_cache_key(prefix: str, payload: str) -> str:
    """Create a deterministic cache key from prefix and request payload."""
    h = hashlib.sha256(payload.encode()).hexdigest()[:16]
    return f"{prefix}:{h}"
