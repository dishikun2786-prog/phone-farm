"""
LLM Inference Module.

Wraps MNN/Qwen2-0.5B for on-device text generation with cloud fallback
to Anthropic API (DeepSeek V4 Flash).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import AsyncGenerator, Optional

import aiohttp

logger = logging.getLogger("phonefarm.ai.llm")

# Lazy MNN import — only imported if local model is available
_MNN = None


def _get_mnn():
    global _MNN
    if _MNN is None:
        try:
            import MNN as _mnn
            _MNN = _mnn
        except ImportError:
            pass
    return _MNN


@dataclass
class GenerationResult:
    """Result from text generation."""
    text: str
    tokens_used: int
    inference_time_ms: float
    finish_reason: str  # "stop", "length", "error"


class LLMInference:
    """
    LLM inference engine supporting:
      - Local MNN/Qwen2-0.5B inference (fast, on-device)
      - Cloud fallback to DeepSeek V4 Flash via Anthropic Messages API
      - Streaming generation support
      - Prompt template management for different model types
      - Token counting and context window management

    The cloud fallback is transparent: if the local model fails or is unavailable,
    requests are automatically routed to the cloud API.
    """

    # Qwen2 chat template
    CHAT_TEMPLATE = """<|im_start|>system
You are a helpful assistant for PhoneFarm device automation. You analyze mobile screens and provide concise, actionable decisions.<|im_end|>
<|im_start|>user
{prompt}<|im_end|>
<|im_start|>assistant
"""

    def __init__(self, config):
        self.config = config
        self._model = None
        self._tokenizer = None
        self._model_version = "unknown"
        self._initialized = False
        self._max_context_length = 4096

    @property
    def model_version(self) -> str:
        return self._model_version

    @property
    def is_loaded(self) -> bool:
        return self._model is not None and self._tokenizer is not None

    async def load_model(self) -> None:
        """Load the MNN model and tokenizer."""
        if self._model is not None:
            return

        model_path = self.config.llm_model_path
        tokenizer_path = self.config.llm_tokenizer_path

        if not os.path.exists(model_path):
            logger.warning(
                "Local LLM model not found at %s. Will use cloud fallback.",
                model_path,
            )
            self._model_version = "cloud-fallback"
            return

        try:
            # Try loading MNN model
            try:
                MNN = _get_mnn()
                if MNN is None:
                    raise ImportError("MNN not available")

                logger.info("Loading MNN LLM model from %s...", model_path)

                # MNN LLM configuration
                llm_config = {
                    "model": model_path,
                    "max_length": 4096,
                    "max_new_tokens": 2048,
                }

                # MNN.llm module for LLM inference
                if hasattr(MNN, 'llm'):
                    self._model = MNN.llm.load(llm_config)
                    logger.info("MNN LLM model loaded via MNN.llm API")
                else:
                    # Fall back to general MNN inference
                    interpreter = MNN.Interpreter(model_path)
                    session_config = {
                        "backend": MNN.expr.Backend.CPU,
                        "numThread": 4,
                    }
                    session = interpreter.createSession(session_config)
                    self._model = interpreter
                    logger.info("MNN model loaded via general Interpreter API")

                self._model_version = os.path.basename(model_path).replace(".mnn", "")
                self._initialized = True

            except ImportError:
                logger.warning("MNN not installed. Using cloud fallback.")
                self._model_version = "cloud-fallback"
                return

            # Load tokenizer (sentencepiece or huggingface tokenizers)
            if os.path.exists(tokenizer_path):
                try:
                    from transformers import AutoTokenizer
                    self._tokenizer = AutoTokenizer.from_pretrained(
                        tokenizer_path, trust_remote_code=True
                    )
                    logger.info("Tokenizer loaded from %s", tokenizer_path)
                except ImportError:
                    logger.warning("transformers not installed, using basic tokenizer")
                    self._tokenizer = self._create_basic_tokenizer()
            else:
                self._tokenizer = self._create_basic_tokenizer()

        except Exception as e:
            logger.exception("Failed to load LLM model")
            self._model = None
            self._model_version = "cloud-fallback"
            logger.info("Falling back to cloud API (DeepSeek V4 Flash)")

    async def generate(
        self,
        prompt: str,
        max_tokens: int = 256,
        temperature: float = 0.7,
    ) -> GenerationResult:
        """
        Generate text from a prompt.

        Tries local model first; falls back to cloud API if local is unavailable.

        Args:
            prompt: Input text prompt.
            max_tokens: Maximum number of tokens to generate.
            temperature: Sampling temperature (0.0 = deterministic, 1.0 = creative).

        Returns:
            GenerationResult with the generated text and metadata.
        """
        # Try local inference first
        if self._model is not None and self._tokenizer is not None:
            try:
                return await self._generate_local(prompt, max_tokens, temperature)
            except Exception as e:
                logger.warning("Local LLM inference failed: %s. Falling back to cloud.", e)

        # Cloud fallback
        if self.config.cloud_api_key:
            try:
                return await self._generate_cloud(prompt, max_tokens, temperature)
            except Exception as e:
                logger.error("Cloud LLM fallback also failed: %s", e)
                return GenerationResult(
                    text="",
                    tokens_used=0,
                    inference_time_ms=0,
                    finish_reason="error",
                )

        raise RuntimeError(
            "LLM not available. Either load a local model or set DEEPSEEK_API_KEY."
        )

    async def generate_stream(
        self,
        prompt: str,
        max_tokens: int = 256,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """Stream generated tokens as they become available."""
        if self._model is not None and self._tokenizer is not None:
            try:
                async for token in self._generate_local_stream(prompt, max_tokens, temperature):
                    yield token
                return
            except Exception as e:
                logger.warning("Local LLM stream failed: %s. Falling back to cloud.", e)

        if self.config.cloud_api_key:
            try:
                async for token in self._generate_cloud_stream(prompt, max_tokens, temperature):
                    yield token
            except Exception as e:
                logger.error("Cloud LLM stream failed: %s", e)
                yield ""

    # ── Local Generation ──

    async def _generate_local(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> GenerationResult:
        """Run inference using the local MNN model."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._generate_local_sync,
            prompt,
            max_tokens,
            temperature,
        )

    def _generate_local_sync(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> GenerationResult:
        t_start = time.perf_counter()

        try:
            # Format with chat template
            formatted = self.CHAT_TEMPLATE.format(prompt=prompt)

            # Tokenize
            input_ids = self._tokenize(formatted)

            # Truncate to context window
            context_limit = self._max_context_length - max_tokens
            if len(input_ids) > context_limit:
                input_ids = input_ids[-context_limit:]

            # Run inference
            if hasattr(self._model, 'generate'):
                # MNN.llm API
                output = self._model.generate(
                    input_ids,
                    max_new_tokens=max_tokens,
                    temperature=temperature,
                )
                generated_text = self._detokenize(output)
                tokens_used = len(output) if isinstance(output, list) else 0
                finish_reason = "stop" if tokens_used < max_tokens else "length"
                tokens_used = tokens_used - len(input_ids) if tokens_used > len(input_ids) else tokens_used
            else:
                # General MNN interpreter
                generated_text, tokens_used = self._run_mnn_inference(
                    input_ids, max_tokens, temperature
                )
                finish_reason = "stop" if tokens_used < max_tokens else "length"

            t_elapsed = (time.perf_counter() - t_start) * 1000

            return GenerationResult(
                text=generated_text.strip(),
                tokens_used=tokens_used,
                inference_time_ms=round(t_elapsed, 2),
                finish_reason=finish_reason,
            )
        except Exception as e:
            logger.error("Local inference failed: %s", e)
            raise

    async def _generate_local_stream(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens from local model."""
        result = await self._generate_local(prompt, max_tokens, temperature)
        # For now, yield complete result as single chunk
        # Token-by-token streaming requires MNN callback API
        yield result.text

    # ── Cloud Fallback (Anthropic Messages API via DeepSeek) ──

    async def _generate_cloud(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> GenerationResult:
        """Generate via DeepSeek V4 Flash using Anthropic Messages API."""
        t_start = time.perf_counter()

        headers = {
            "x-api-key": self.config.cloud_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        body = {
            "model": "deepseek-v4-flash",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
        }

        timeout = aiohttp.ClientTimeout(total=self.config.request_timeout)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{self.config.cloud_api_base}/messages",
                headers=headers,
                json=body,
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    raise RuntimeError(
                        f"Cloud API returned {resp.status}: {error_text[:500]}"
                    )

                data = await resp.json()

        t_elapsed = (time.perf_counter() - t_start) * 1000

        # Extract response from Anthropic format
        content = ""
        tokens_used = 0
        finish_reason = "stop"

        if "content" in data and isinstance(data["content"], list):
            for block in data["content"]:
                if block.get("type") == "text":
                    content += block.get("text", "")

        if "usage" in data:
            tokens_used = data["usage"].get("output_tokens", 0)

        if "stop_reason" in data:
            finish_reason = data["stop_reason"]

        return GenerationResult(
            text=content.strip(),
            tokens_used=tokens_used,
            inference_time_ms=round(t_elapsed, 2),
            finish_reason=finish_reason,
        )

    async def _generate_cloud_stream(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens from cloud API via SSE."""
        headers = {
            "x-api-key": self.config.cloud_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        body = {
            "model": "deepseek-v4-flash",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
        }

        timeout = aiohttp.ClientTimeout(total=self.config.request_timeout)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{self.config.cloud_api_base}/messages",
                headers=headers,
                json=body,
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    logger.error("Cloud API streaming error: %s", error_text[:500])
                    return

                async for line in resp.content:
                    line_text = line.decode("utf-8").strip()
                    if not line_text or not line_text.startswith("data: "):
                        continue

                    data_str = line_text[6:]  # Remove "data: " prefix
                    if data_str == "[DONE]":
                        return

                    try:
                        data = json.loads(data_str)
                        if data.get("type") == "content_block_delta":
                            delta = data.get("delta", {})
                            text_delta = delta.get("text", "")
                            if text_delta:
                                yield text_delta
                    except json.JSONDecodeError:
                        continue

    # ── Tokenizer Helpers ──

    def _tokenize(self, text: str) -> list[int]:
        """Tokenize text into token IDs."""
        if hasattr(self._tokenizer, 'encode'):
            return self._tokenizer.encode(text)
        # Basic character-level tokenization
        return [ord(c) for c in text]

    def _detokenize(self, token_ids: list[int]) -> str:
        """Convert token IDs back to text."""
        if hasattr(self._tokenizer, 'decode'):
            return self._tokenizer.decode(token_ids, skip_special_tokens=True)
        # Basic character-level detokenization
        return ''.join(chr(i) for i in token_ids if 0 <= i <= 0x10FFFF)

    def _run_mnn_inference(
        self,
        input_ids: list[int],
        max_tokens: int,
        temperature: float,
    ) -> tuple[str, int]:
        """Run autoregressive generation using the MNN interpreter."""
        import numpy as np

        generated_ids = list(input_ids)
        tokens_generated = 0

        input_tensor = self._model.getSessionInput(self._model.getSession())
        output_tensor = self._model.getSessionOutput(self._model.getSession())

        for _ in range(max_tokens):
            # Reshape input for single token prediction
            current_input = np.array([generated_ids], dtype=np.int32)

            if input_tensor is not None:
                self._model.resizeTensor(input_tensor, current_input.shape)
                input_data = _get_mnn().expr.const(current_input, current_input.shape, _get_mnn().expr.NCHW)
                self._model.getSession().run()

            if output_tensor is not None:
                output = output_tensor.getData()
                if output is not None:
                    output_probs = np.array(output, dtype=np.float32)

                    if temperature > 0:
                        # Apply temperature scaling
                        output_probs = output_probs / max(temperature, 1e-10)
                        output_probs = np.exp(output_probs) / np.sum(np.exp(output_probs))

                    next_token = int(np.argmax(output_probs))
                else:
                    break
            else:
                break

            generated_ids.append(next_token)
            tokens_generated += 1

            # Stop token detection (Qwen2 uses <|im_end|> which maps to specific token IDs)
            if next_token == 151645:  # <|im_end|> for Qwen2
                break

        generated_text = self._detokenize(generated_ids[len(input_ids):])
        return generated_text, tokens_generated

    def _create_basic_tokenizer(self):
        """Create a basic character-level tokenizer when transformers is not available."""

        class BasicTokenizer:
            def encode(self, text: str) -> list[int]:
                return [ord(c) for c in text]

            def decode(self, ids: list[int], skip_special_tokens: bool = True) -> str:
                return ''.join(chr(i) for i in ids if 0 < i <= 0x10FFFF)

        return BasicTokenizer()
