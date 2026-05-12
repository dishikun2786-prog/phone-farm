"""
ClawGUI VLM Bridge — Python microservice for VLM inference.
Decoupled from PhoneFarm's Node.js control server via HTTP API.

Start: python server.py
Default: http://localhost:5000
"""

import base64
import json
import logging
import os
import time
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from memory import MemoryManager, get_memory_manager
from bot import wecom_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [VLM] %(message)s")
log = logging.getLogger("vlm-bridge")

app = FastAPI(title="ClawGUI VLM Bridge", version="0.1.0")

# ── Config ──────────────────────────────────────────────────────────
VLM_BASE_URL = os.getenv("VLM_BASE_URL", "http://localhost:8000/v1")
VLM_MODEL_NAME = os.getenv("VLM_MODEL_NAME", "autoglm-phone-9b")
VLM_API_KEY = os.getenv("VLM_API_KEY", "not-needed")
VLM_MAX_TOKENS = int(os.getenv("VLM_MAX_TOKENS", "1024"))
VLM_TEMPERATURE = float(os.getenv("VLM_TEMPERATURE", "0.1"))

# ── Models ──────────────────────────────────────────────────────────
class VLMScreenshot(BaseModel):
    base64: str
    width: int = 1080
    height: int = 2400

class VLMRequest(BaseModel):
    task: str                      # Natural language task description
    screenshot: VLMScreenshot      # Current screen state
    history: list[dict[str, Any]] = []  # Past (screenshot, action) pairs
    current_app: str = ""          # Foreground app package name
    lang: str = "cn"               # Prompt language
    step_number: int = 0           # Current step index

class VLMAction(BaseModel):
    type: str                      # tap | swipe | type | back | home | launch | terminate | answer
    x: int | None = None
    y: int | None = None
    x2: int | None = None
    y2: int | None = None
    text: str | None = None
    package: str | None = None
    message: str | None = None     # For terminate/answer

class VLMResponse(BaseModel):
    action: VLMAction
    thinking: str                  # Model reasoning chain
    finished: bool                 # True if task is complete
    raw_content: str               # Raw model output for debugging

# ── Memory Models ──────────────────────────────────────────────────

class MemoryAddRequest(BaseModel):
    user_id: str = "default"
    content: str
    category: str = "task_pattern"
    importance: float = 0.5

class MemoryQueryRequest(BaseModel):
    user_id: str = "default"
    query: str
    top_k: int = 5
    category: Optional[str] = None

class MemoryCorrectionRequest(BaseModel):
    user_id: str = "default"
    task: str
    correction: str

class MemoryImportRequest(BaseModel):
    data: list[dict[str, Any]]

# ── Model Adapters ──────────────────────────────────────────────────

class AutoGLMAdapter:
    """Parses AutoGLM-Phone-9B output: <think>...</think><answer>...</answer>"""

    @staticmethod
    def build_prompt(task: str, lang: str, current_app: str) -> list[dict]:
        system_prompt = (
            "你是一个手机操作助手。根据截图和任务描述，决定下一步操作。\n"
            "输出格式：<think>推理过程</think><answer>动作指令</answer>\n"
            "可用动作：\n"
            "- do(action=\"Tap\", element=[x,y])  点击坐标（归一化到[0,1000]）\n"
            "- do(action=\"Swipe\", start=[x1,y1], end=[x2,y2])  滑动\n"
            "- do(action=\"Type\", text=\"内容\")  输入文本\n"
            "- do(action=\"Back\")  返回\n"
            "- do(action=\"Home\")  回到桌面\n"
            "- do(action=\"Launch\", app=\"包名\")  启动应用\n"
            "- finish(message=\"完成描述\")  任务完成\n"
        ) if lang == "cn" else (
            "You are a phone operation assistant. Based on the screenshot and task, decide the next action.\n"
            "Output format: <think>reasoning</think><answer>action</answer>\n"
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": task},
        ]

    @staticmethod
    def parse_response(content: str, screen_w: int, screen_h: int) -> tuple[dict, str, bool]:
        """Parse AutoGLM response and denormalize coordinates from [0,1000] to pixels."""
        import re

        thinking = ""
        action: dict[str, Any] = {"type": "tap", "x": 0, "y": 0}
        finished = False

        think_match = re.search(r"<think>(.*?)</think>", content, re.DOTALL)
        if think_match:
            thinking = think_match.group(1).strip()

        answer = content
        answer_match = re.search(r"<answer>(.*?)</answer>", content, re.DOTALL)
        if answer_match:
            answer = answer_match.group(1).strip()

        # Parse finish
        finish_match = re.search(r'finish\s*\(\s*message\s*=\s*"([^"]*)"', answer)
        if finish_match:
            action = {"type": "terminate", "message": finish_match.group(1)}
            finished = True
            return action, thinking, finished

        # Parse do(...)
        do_match = re.search(r"do\s*\((.*?)\)", answer, re.DOTALL)
        if do_match:
            params = do_match.group(1)

            action_type = re.search(r'action\s*=\s*"(\w+)"', params)
            atype = action_type.group(1) if action_type else "Tap"

            if atype in ("Tap", "LongPress"):
                coords = re.search(r"element\s*=\s*\[(\d+),\s*(\d+)\]", params)
                if coords:
                    x = int(int(coords.group(1)) / 1000 * screen_w)
                    y = int(int(coords.group(2)) / 1000 * screen_h)
                    action = {"type": "tap" if atype == "Tap" else "long_press", "x": x, "y": y}

            elif atype == "Swipe":
                start = re.search(r"start\s*=\s*\[(\d+),\s*(\d+)\]", params)
                end = re.search(r"end\s*=\s*\[(\d+),\s*(\d+)\]", params)
                if start and end:
                    x1 = int(int(start.group(1)) / 1000 * screen_w)
                    y1 = int(int(start.group(2)) / 1000 * screen_h)
                    x2 = int(int(end.group(1)) / 1000 * screen_w)
                    y2 = int(int(end.group(2)) / 1000 * screen_h)
                    action = {"type": "swipe", "x": x1, "y": y1, "x2": x2, "y2": y2}

            elif atype == "Type":
                text = re.search(r'text\s*=\s*"([^"]*)"', params)
                if text:
                    action = {"type": "type", "text": text.group(1)}

            elif atype == "Back":
                action = {"type": "back"}
            elif atype == "Home":
                action = {"type": "home"}
            elif atype == "Launch":
                app = re.search(r'app\s*=\s*"([^"]*)"', params)
                if app:
                    action = {"type": "launch", "package": app.group(1)}

        return action, thinking, finished


class QwenVLAdapter:
    """Parses Qwen-VL output: JSON action blocks."""

    @staticmethod
    def build_prompt(task: str, lang: str, current_app: str) -> list[dict]:
        system_prompt = (
            "You are a phone GUI agent. Output the next action as JSON.\n"
            'Format: {"action": "tap", "x": 540, "y": 1200, "thinking": "..."}\n'
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": task},
        ]

    @staticmethod
    def parse_response(content: str, screen_w: int, screen_h: int) -> tuple[dict, str, bool]:
        """Parse Qwen-VL JSON response."""
        import re

        thinking = ""
        action: dict[str, Any] = {"type": "tap", "x": 0, "y": 0}
        finished = False

        # Extract JSON block
        json_match = re.search(r"\{[^{}]*\"action\"[^{}]*\}", content, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group(0))
                thinking = parsed.get("thinking", "")
                atype = parsed.get("action", "tap")

                if atype == "terminate":
                    action = {"type": "terminate", "message": parsed.get("message", "Done")}
                    finished = True
                elif atype == "answer":
                    action = {"type": "terminate", "message": parsed.get("message", parsed.get("answer", "Done"))}
                    finished = True
                elif atype == "tap":
                    action = {"type": "tap", "x": parsed.get("x", 0), "y": parsed.get("y", 0)}
                elif atype == "swipe":
                    action = {"type": "swipe", "x": parsed.get("x1", 0), "y": parsed.get("y1", 0),
                              "x2": parsed.get("x2", 0), "y2": parsed.get("y2", 0)}
                elif atype == "type":
                    action = {"type": "type", "text": parsed.get("text", "")}
                elif atype == "back":
                    action = {"type": "back"}
                elif atype == "home":
                    action = {"type": "home"}
            except json.JSONDecodeError:
                pass

        return action, thinking, finished


# ── Adapter Registry ────────────────────────────────────────────────
ADAPTERS = {
    "autoglm": AutoGLMAdapter,
    "qwenvl": QwenVLAdapter,
    "uitars": AutoGLMAdapter,    # UI-TARS uses similar format, stub for now
    "maiui": QwenVLAdapter,       # MAI-UI uses JSON, shared parser
    "guiowl": QwenVLAdapter,      # GUI-Owl uses JSON, shared parser
}

def get_adapter(model_name: str):
    """Auto-detect adapter from model name."""
    name_lower = model_name.lower()
    if "autoglm" in name_lower:
        return ADAPTERS["autoglm"]
    elif "qwen" in name_lower:
        return ADAPTERS["qwenvl"]
    elif "uitars" in name_lower or "tars" in name_lower:
        return ADAPTERS["uitars"]
    elif "maiui" in name_lower or "mai" in name_lower:
        return ADAPTERS["maiui"]
    elif "guiowl" in name_lower or "gui" in name_lower:
        return ADAPTERS["guiowl"]
    return ADAPTERS["autoglm"]  # default


# ── API Endpoints ───────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "model": VLM_MODEL_NAME, "base_url": VLM_BASE_URL}


@app.post("/api/vlm/execute", response_model=VLMResponse)
async def execute_vlm(req: VLMRequest):
    """Execute one VLM step: screenshot + task → action."""
    adapter = get_adapter(VLM_MODEL_NAME)
    t0 = time.time()

    try:
        # Build messages
        messages = adapter.build_prompt(req.task, req.lang, req.current_app)

        # Add history as conversation context
        for h in req.history[-5:]:  # Keep last 5 turns for context
            if h.get("screenshot"):
                messages.append({
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{h['screenshot']}"}},
                        {"type": "text", "text": f"Step result: {json.dumps(h.get('action', {}))}"},
                    ]
                })

        # Add current screenshot
        messages.append({
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{req.screenshot.base64}"}},
                {"type": "text", "text": f"Current app: {req.current_app}. Step {req.step_number}. What should I do next?"},
            ]
        })

        # Call VLM
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{VLM_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {VLM_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": VLM_MODEL_NAME,
                    "messages": messages,
                    "max_tokens": VLM_MAX_TOKENS,
                    "temperature": VLM_TEMPERATURE,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        raw_content = data["choices"][0]["message"]["content"]
        elapsed_ms = int((time.time() - t0) * 1000)

        # Parse action
        action_dict, thinking, finished = adapter.parse_response(
            raw_content, req.screenshot.width, req.screenshot.height
        )

        log.info(
            "Step %d: %s -> %s (%.0fms)",
            req.step_number,
            req.task[:50],
            action_dict.get("type", "unknown"),
            elapsed_ms,
        )

        return VLMResponse(
            action=VLMAction(**action_dict),
            thinking=thinking,
            finished=finished,
            raw_content=raw_content,
        )

    except httpx.HTTPError as e:
        log.error("VLM API error: %s", e)
        raise HTTPException(status_code=502, detail=f"VLM API error: {str(e)}")
    except Exception as e:
        log.error("Bridge error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Memory Endpoints ──────────────────────────────────────────────

@app.post("/api/memory/query")
async def memory_query(req: MemoryQueryRequest):
    """Retrieve relevant memories for a task via semantic search."""
    mgr = get_memory_manager(req.user_id)
    results = mgr.retrieve(req.query, top_k=req.top_k, category=req.category)
    return {"user_id": req.user_id, "query": req.query, "results": results, "count": len(results)}


@app.post("/api/memory/add")
async def memory_add(req: MemoryAddRequest):
    """Add a new memory (or upsert if similar memory exists)."""
    mgr = get_memory_manager(req.user_id)
    result = mgr.add_memory(
        content=req.content,
        category=req.category,
        importance=req.importance,
    )
    return {"user_id": req.user_id, "memory": result, "action": "upserted"}


@app.post("/api/memory/correction")
async def memory_correction(req: MemoryCorrectionRequest):
    """Record a user correction episode."""
    mgr = get_memory_manager(req.user_id)
    result = mgr.add_user_correction(task=req.task, correction=req.correction)
    return {"user_id": req.user_id, "memory": result, "action": "correction_recorded"}


@app.get("/api/memory/summary/{user_id}")
async def memory_summary(user_id: str):
    """Get structured summary of all memories for a user."""
    mgr = get_memory_manager(user_id)
    return mgr.get_user_summary()


@app.delete("/api/memory/{user_id}")
async def memory_clear(user_id: str):
    """Clear all memories for a user."""
    mgr = get_memory_manager(user_id)
    count_before = len(mgr)
    mgr.clear()
    return {"user_id": user_id, "deleted_count": count_before, "action": "cleared"}


@app.post("/api/memory/export/{user_id}")
async def memory_export(user_id: str):
    """Export all memories for a user as JSON."""
    mgr = get_memory_manager(user_id)
    data = mgr.export_memories()
    return {"user_id": user_id, "memories": data, "count": len(data)}


@app.post("/api/memory/import/{user_id}")
async def memory_import(user_id: str, req: MemoryImportRequest):
    """Import memories for a user from a JSON list."""
    mgr = get_memory_manager(user_id)
    count = mgr.import_memories(req.data)
    return {"user_id": user_id, "imported_count": count, "total_count": len(mgr)}


# ── Bot Routes ─────────────────────────────────────────────────────

app.include_router(wecom_router)

# ── Main ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("BRIDGE_PORT", "5000"))
    log.info("Starting ClawGUI VLM Bridge on port %d", port)
    log.info("Model: %s @ %s", VLM_MODEL_NAME, VLM_BASE_URL)
    uvicorn.run(app, host="0.0.0.0", port=port)
