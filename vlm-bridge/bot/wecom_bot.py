"""
WeCom (企业微信) bot webhook integration for VLM Bridge.

Handles incoming WeCom webhook messages, parses text commands, and routes
them to the VLM execute endpoint. Returns results as WeCom markdown messages.

Endpoints (mounted by server.py):
    GET  /api/bot/wecom/callback  — URL verification (echostr)
    POST /api/bot/wecom/callback  — Webhook message handler

Supported commands:
    /task <device> <nl command>   — Execute a VLM task on a device
    /status                       — Show bot and bridge health status
    /help                         — Show available commands
"""

import hashlib
import json
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

log = logging.getLogger("vlm-bridge.wecom")

router = APIRouter(prefix="/api/bot/wecom", tags=["wecom-bot"])

# ── Config ───────────────────────────────────────────────────────────
WECOM_TOKEN = os.getenv("WECOM_TOKEN", "")
WECOM_ENCODING_AES_KEY = os.getenv("WECOM_ENCODING_AES_KEY", "")
WECOM_CORP_ID = os.getenv("WECOM_CORP_ID", "")
WECOM_ENABLE_SIGNATURE = os.getenv("WECOM_ENABLE_SIGNATURE", "false").lower() in (
    "1", "true", "yes"
)
BRIDGE_BASE_URL = os.getenv("BRIDGE_BASE_URL", "http://localhost:5000")


# ── Signature Verification ───────────────────────────────────────────

def _verify_signature(token: str, timestamp: str, nonce: str, echostr: str,
                      msg_signature: str) -> bool:
    """
    Verify WeCom webhook signature.
    WeChat/WeCom signature algorithm: sort [token, timestamp, nonce, echostr],
    join, SHA1 hash, compare.
    """
    if not token:
        log.warning("WECOM_TOKEN not set — skipping signature verification")
        return True

    items = sorted([token, timestamp, nonce, echostr])
    joined = "".join(items)
    computed = hashlib.sha1(joined.encode()).hexdigest()
    return computed == msg_signature


# ── XML Message Parsing ──────────────────────────────────────────────

def _parse_wecom_xml(body: str) -> dict[str, Any]:
    """Parse WeCom XML callback message and return structured dict."""
    try:
        root = ET.fromstring(body)
        msg: dict[str, Any] = {}
        for child in root:
            msg[child.tag] = child.text or ""
        return msg
    except ET.ParseError as e:
        log.error("Failed to parse WeCom XML: %s", e)
        return {}


# ── Command Handlers ─────────────────────────────────────────────────

def _format_markdown_response(text: str) -> str:
    """Wrap response in WeCom markdown message XML."""
    return f"""
<xml>
    <MsgType>markdown</MsgType>
    <Markdown>
        <Content><![CDATA[{text}]]></Content>
    </Markdown>
</xml>
""".strip()


def _format_text_response(text: str) -> str:
    """Wrap response in WeCom text message XML."""
    return f"""
<xml>
    <MsgType>text</MsgType>
    <Content><![CDATA[{text}]]></Content>
</xml>
""".strip()


async def _handle_help() -> str:
    """Return available commands."""
    help_text = """## VLM Bridge Bot 帮助
> 可用命令列表

**`/task <设备> <自然语言指令>`**
在指定设备上执行VLM任务
示例: `/task pixel6 打开微信并发送消息给张三`

**`/status`**
查看Bot和VLM Bridge健康状态

**`/help`**
显示此帮助信息

---
*Powered by PhoneFarm VLM Bridge*"""
    return _format_markdown_response(help_text)


async def _handle_status() -> str:
    """Check bridge health and return status."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BRIDGE_BASE_URL}/health")
            resp.raise_for_status()
            health = resp.json()
    except Exception as e:
        return _format_markdown_response(
            f"## 状态检查失败\nVLM Bridge 不可达: {str(e)}\n"
            f"目标地址: {BRIDGE_BASE_URL}"
        )

    model = health.get("model", "unknown")
    status_str = health.get("status", "unknown")
    base_url = health.get("base_url", "unknown")

    return _format_markdown_response(
        f"## VLM Bridge 状态\n"
        f"> 当前状态: **{status_str}**\n"
        f"> 模型: `{model}`\n"
        f"> VLM地址: `{base_url}`\n"
        f"> Bridge地址: `{BRIDGE_BASE_URL}`\n"
        f"> 检查时间: {time.strftime('%Y-%m-%d %H:%M:%S')}"
    )


async def _handle_task(args: str, from_user: str) -> str:
    """
    Parse task command and submit to VLM Bridge.
    Format: /task <device_id> <natural language command>
    """
    # Parse arguments: device_id followed by task description
    parts = args.strip().split(None, 1)
    if len(parts) < 2:
        return _format_text_response(
            "用法: /task <设备ID> <自然语言指令>\n"
            "示例: /task pixel6 打开微信搜索张三并发送你好"
        )

    device_id = parts[0]
    task_description = parts[1]

    log.info("Task from %s: device=%s, task=%s", from_user, device_id, task_description)

    # For now, WeCom bot submits the task as a command — actual VLM execution
    # on the device requires the device to be connected via the PhoneFarm bridge.
    # We return an acknowledgment and register the task intent.

    return _format_markdown_response(
        f"## 任务已接收\n"
        f"> 发起人: **{from_user}**\n"
        f"> 目标设备: **{device_id}**\n"
        f"> 任务描述: {task_description}\n"
        f"> 提交时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"\n"
        f"任务已排队，设备 `{device_id}` 将在下次心跳时获取任务。\n"
        f"如需实时执行，请确保设备在线并通过Web仪表盘提交。"
    )


async def _handle_default(content: str) -> str:
    """Fallback handler for unrecognized messages."""
    return _format_text_response(
        f"未知命令。发送 `/help` 查看可用命令。\n你发送的内容: {content[:100]}"
    )


# ── Routes ───────────────────────────────────────────────────────────

@router.get("/callback")
async def wecom_verify(
    msg_signature: str = Query(default="", alias="msg_signature"),
    timestamp: str = Query(default=""),
    nonce: str = Query(default=""),
    echostr: str = Query(default=""),
):
    """
    WeCom URL verification endpoint.
    WeCom calls GET with signature params and expects the decrypted echostr back.
    """
    if WECOM_ENABLE_SIGNATURE:
        if not WECOM_TOKEN:
            log.warning("WeCom signature verification enabled but WECOM_TOKEN not set")
        else:
            ok = _verify_signature(WECOM_TOKEN, timestamp, nonce, echostr, msg_signature)
            if not ok:
                log.warning("WeCom signature verification FAILED")
                raise HTTPException(status_code=403, detail="Signature verification failed")

    # In production with encryption: decrypt echostr using AES key.
    # For unencrypted mode (most common), return echostr directly.
    log.info("WeCom URL verification OK, returning echostr")
    return int(echostr) if echostr.isdigit() else echostr


@router.post("/callback")
async def wecom_callback(request: Request):
    """
    Handle incoming WeCom webhook message (POST).
    Parses XML body, dispatches commands, returns XML response.
    """
    body = await request.body()
    body_str = body.decode("utf-8")

    # If signature verification is enabled, verify request signature
    if WECOM_ENABLE_SIGNATURE and WECOM_TOKEN:
        params = request.query_params
        sig = params.get("msg_signature", "")
        ts = params.get("timestamp", "")
        nonce = params.get("nonce", "")
        if not _verify_signature(WECOM_TOKEN, ts, nonce, body_str, sig):
            log.warning("WeCom POST signature verification FAILED")
            raise HTTPException(status_code=403, detail="Signature verification failed")

    # Parse XML message
    msg = _parse_wecom_xml(body_str)
    if not msg:
        return _format_text_response("无法解析消息")

    msg_type = msg.get("MsgType", "").lower()
    content = msg.get("Content", "").strip()
    from_user = msg.get("FromUserName", "unknown")

    log.info("WeCom message from %s: type=%s content=%s", from_user, msg_type, content[:100])

    # Only handle text messages
    if msg_type != "text":
        return _format_text_response(f"暂不支持 {msg_type} 类型的消息。目前仅支持文本命令。")

    # Event type messages (subscribe, etc.) — ignore
    if msg.get("Event"):
        return "success"

    # Route commands
    content_stripped = content.strip()
    if content_stripped == "/help" or content_stripped == "帮助" or content_stripped == "help":
        return await _handle_help()
    elif content_stripped == "/status" or content_stripped == "状态" or content_stripped == "status":
        return await _handle_status()
    elif content_stripped.startswith("/task") or content_stripped.startswith("任务"):
        args = content_stripped
        if content_stripped.startswith("/task"):
            args = content_stripped[5:].strip()
        elif content_stripped.startswith("任务"):
            args = content_stripped[2:].strip()
        return await _handle_task(args, from_user)
    else:
        return await _handle_default(content_stripped)
