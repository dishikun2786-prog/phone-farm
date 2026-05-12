"""
Vector-based personalized memory system for VLM Bridge.
Inspired by ClawGUI — stores structured facts and retrieves relevant context
for VLM inference using TF-IDF cosine similarity.

Storage: JSON files at ~/.phonefarm/memory/{user_id}/
"""

import json
import re
import time
import uuid
from collections import Counter
from pathlib import Path
from typing import Any, Optional

import numpy as np


# ── Configuration ─────────────────────────────────────────────────────
MEMORY_BASE_DIR = Path.home() / ".phonefarm" / "memory"
SIMILARITY_THRESHOLD = 0.85   # Merge duplicates above this threshold
DEFAULT_TOP_K = 5
MEMORY_CATEGORIES = frozenset({
    "contact", "app_knowledge", "preference", "correction", "task_pattern"
})
MAX_MEMORIES_PER_FILE = 2000


class MemoryManager:
    """
    TF-IDF vector memory system with cosine similarity retrieval.

    Each memory is a structured fact:
        {
            "id": str,
            "content": str,
            "category": str,
            "importance": float,     # 0.0 - 1.0
            "created_at": float,     # unix timestamp
            "updated_at": float,
            "access_count": int
        }

    Embeddings are computed via local vocabulary-based TF-IDF so no GPU
    or external model is needed.
    """

    def __init__(self, user_id: str = "default"):
        self.user_id = user_id
        self.storage_dir = MEMORY_BASE_DIR / user_id
        self._memories: list[dict[str, Any]] = []
        self._vocab: dict[str, int] = {}       # token -> index
        self._idf: np.ndarray = np.array([])    # inverse document frequency
        self._dirty = False                    # True when memories changed in memory
        self._loaded = False

        self._load()

    # ── Persistence ──────────────────────────────────────────────────

    def _get_file_path(self) -> Path:
        return self.storage_dir / "memories.json"

    def _load(self) -> None:
        """Load memories from JSON file and rebuild vocabulary index."""
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        filepath = self._get_file_path()

        if filepath.exists():
            try:
                raw = json.loads(filepath.read_text(encoding="utf-8"))
                if isinstance(raw, list):
                    self._memories = raw
                else:
                    self._memories = []
            except (json.JSONDecodeError, OSError):
                self._memories = []
        else:
            self._memories = []

        self._rebuild_index()
        self._loaded = True
        self._dirty = False

    def _save(self) -> None:
        """Persist memories to JSON file."""
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        filepath = self._get_file_path()
        filepath.write_text(
            json.dumps(self._memories, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self._dirty = False

    def _rebuild_index(self) -> None:
        """Rebuild vocabulary and IDF from current memories."""
        if not self._memories:
            self._vocab = {}
            self._idf = np.array([])
            return

        # Tokenize all documents
        all_tokens: list[list[str]] = [
            self._tokenize(m["content"]) for m in self._memories
        ]

        # Build vocabulary (sorted for determinism)
        vocab_counter: Counter = Counter()
        for tokens in all_tokens:
            vocab_counter.update(set(tokens))

        self._vocab = {
            token: idx
            for idx, (token, _) in enumerate(
                sorted(vocab_counter.items(), key=lambda x: -x[1])
            )
        }

        # Compute IDF: log((N + 1) / (df + 1)) + 1  (smooth)
        N = len(self._memories)
        idf = np.zeros(len(self._vocab), dtype=np.float64)
        for tokens in all_tokens:
            seen = set()
            for token in tokens:
                idx = self._vocab.get(token)
                if idx is not None and token not in seen:
                    idf[idx] += 1
                    seen.add(token)

        self._idf = np.log((N + 1) / (idf + 1)) + 1.0

    # ── Tokenization ─────────────────────────────────────────────────

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Simple hybrid tokenizer: Chinese chars + English word n-grams."""
        tokens: list[str] = []

        # Chinese characters and CJK punctuation as individual tokens
        cjk_chars = re.findall(r"[一-鿿㐀-䶿　-〿＀-￯]", text)
        tokens.extend(cjk_chars)

        # English / alphanumeric tokens (split on non-alphanum)
        en_words = re.findall(r"[a-zA-Z0-9_]+", text)
        tokens.extend(w.lower() for w in en_words)

        # Bigrams of Chinese characters for phrase capture
        for i in range(len(cjk_chars) - 1):
            tokens.append(cjk_chars[i] + cjk_chars[i + 1])

        return tokens if tokens else ["_empty_"]

    # ── TF-IDF Vectorization ─────────────────────────────────────────

    def _vectorize(self, text: str) -> np.ndarray:
        """Convert text to a TF-IDF vector."""
        if not self._vocab:
            return np.array([], dtype=np.float64)

        tokens = self._tokenize(text)
        if not tokens:
            return np.zeros(len(self._vocab), dtype=np.float64)

        # Term frequency (raw count, then normalize)
        tf = np.zeros(len(self._vocab), dtype=np.float64)
        for token in tokens:
            idx = self._vocab.get(token)
            if idx is not None:
                tf[idx] += 1

        # Normalize TF
        max_tf = tf.max()
        if max_tf > 0:
            tf = tf / max_tf

        # TF-IDF
        return tf * self._idf

    @staticmethod
    def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        """Cosine similarity between two vectors."""
        if a.size == 0 or b.size == 0:
            return 0.0
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    # ── Public API ───────────────────────────────────────────────────

    def add_memory(
        self,
        content: str,
        category: str = "task_pattern",
        importance: float = 0.5,
    ) -> dict[str, Any]:
        """
        Add or upsert a memory. Deduplicates by merging similar memories
        (cosine similarity > 0.85).

        Returns the stored memory dict.
        """
        if category not in MEMORY_CATEGORIES:
            raise ValueError(
                f"Invalid category '{category}'. Must be one of: {sorted(MEMORY_CATEGORIES)}"
            )

        importance = max(0.0, min(1.0, float(importance)))

        now = time.time()
        vec = self._vectorize(content)

        # Deduplication: check for similar existing memories
        best_sim = 0.0
        best_idx = -1
        for i, mem in enumerate(self._memories):
            if mem["category"] != category:
                continue
            mem_vec = self._vectorize(mem["content"])
            sim = self._cosine_similarity(vec, mem_vec)
            if sim > best_sim:
                best_sim = sim
                best_idx = i

        if best_sim > SIMILARITY_THRESHOLD and best_idx >= 0:
            # Merge: update content (append if different), boost importance
            existing = self._memories[best_idx]
            if content.strip() not in existing["content"]:
                existing["content"] = existing["content"] + " | " + content.strip()
            existing["importance"] = max(existing["importance"], importance)
            existing["updated_at"] = now
            existing["access_count"] += 1
            self._dirty = True
            self._rebuild_index()
            self._save()
            return dict(existing)

        # Create new memory
        memory: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "content": content,
            "category": category,
            "importance": importance,
            "created_at": now,
            "updated_at": now,
            "access_count": 0,
        }
        self._memories.append(memory)
        self._dirty = True
        self._rebuild_index()
        self._save()
        return dict(memory)

    def retrieve(
        self,
        query: str,
        top_k: int = DEFAULT_TOP_K,
        category: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """
        Semantic search via cosine similarity. Returns top-k results sorted
        by (similarity * importance). Updates access_count for returned memories.
        """
        if not self._memories:
            return []

        query_vec = self._vectorize(query)
        scores: list[tuple[float, int]] = []

        for i, mem in enumerate(self._memories):
            if category and mem["category"] != category:
                continue
            mem_vec = self._vectorize(mem["content"])
            sim = self._cosine_similarity(query_vec, mem_vec)
            weighted = sim * (0.5 + 0.5 * mem["importance"])  # importance boost
            scores.append((weighted, i))

        scores.sort(key=lambda x: -x[0])
        results: list[dict[str, Any]] = []
        for score, idx in scores[:top_k]:
            if score <= 0:
                break
            mem = dict(self._memories[idx])
            mem["_similarity"] = round(float(score), 4)
            self._memories[idx]["access_count"] += 1
            self._memories[idx]["updated_at"] = time.time()
            results.append(mem)

        if results:
            self._dirty = True
            self._save()

        return results

    def add_user_correction(self, task: str, correction: str) -> dict[str, Any]:
        """
        Record a correction episode — when the user tells the system it did
        something wrong and provides the correct approach.

        Stores as a 'correction' category memory with high importance.
        """
        content = f"TASK: {task} | CORRECTION: {correction}"
        return self.add_memory(
            content=content,
            category="correction",
            importance=0.95,
        )

    def get_user_summary(self) -> dict[str, Any]:
        """Return a structured summary of all known information about this user."""
        categories_count: dict[str, int] = {}
        total = len(self._memories)
        top_contacts: list[dict[str, Any]] = []
        app_knowledge: list[str] = []
        preferences: list[str] = []
        corrections: list[dict[str, Any]] = []
        task_patterns: list[str] = []

        for mem in self._memories:
            cat = mem["category"]
            categories_count[cat] = categories_count.get(cat, 0) + 1

            if cat == "contact":
                top_contacts.append({
                    "id": mem["id"],
                    "content": mem["content"],
                    "importance": mem["importance"],
                    "access_count": mem["access_count"],
                })
            elif cat == "app_knowledge":
                app_knowledge.append(mem["content"])
            elif cat == "preference":
                preferences.append(mem["content"])
            elif cat == "correction":
                corrections.append({
                    "id": mem["id"],
                    "content": mem["content"],
                    "created_at": mem["created_at"],
                })
            elif cat == "task_pattern":
                task_patterns.append(mem["content"])

        # Sort contacts/task_patterns by importance * access_count
        top_contacts.sort(key=lambda x: x["importance"] * max(x["access_count"], 1), reverse=True)
        top_contacts = top_contacts[:10]

        return {
            "user_id": self.user_id,
            "total_memories": total,
            "categories": categories_count,
            "top_contacts": top_contacts[:5],
            "app_knowledge": app_knowledge[:20],
            "preferences": preferences,
            "corrections": corrections[-10:],
            "task_patterns": task_patterns[:10],
            "storage_path": str(self._get_file_path()),
        }

    def clear(self) -> None:
        """Delete all memories for this user."""
        self._memories.clear()
        self._vocab.clear()
        self._idf = np.array([])
        self._dirty = True
        self._save()
        self._rebuild_index()

    def export_memories(self) -> list[dict[str, Any]]:
        """Export all memories as a list of dicts (for backup)."""
        return [dict(m) for m in self._memories]

    def import_memories(self, data: list[dict[str, Any]]) -> int:
        """
        Import memories from a list of dicts. Merges with existing via
        deduplication. Returns number of new memories added.
        """
        count = 0
        for item in data:
            if not isinstance(item, dict) or "content" not in item:
                continue
            self.add_memory(
                content=item.get("content", ""),
                category=item.get("category", "task_pattern"),
                importance=item.get("importance", 0.5),
            )
            count += 1
        return count

    # ── Convenience ──────────────────────────────────────────────────

    def __len__(self) -> int:
        return len(self._memories)

    def __repr__(self) -> str:
        return f"<MemoryManager user={self.user_id} memories={len(self._memories)}>"


# ── Factory ──────────────────────────────────────────────────────────
_memory_managers: dict[str, MemoryManager] = {}


def get_memory_manager(user_id: str = "default") -> MemoryManager:
    """Singleton factory: returns cached MemoryManager per user_id."""
    if user_id not in _memory_managers:
        _memory_managers[user_id] = MemoryManager(user_id)
    return _memory_managers[user_id]
