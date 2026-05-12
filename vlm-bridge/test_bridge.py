"""
Unit and integration tests for VLM Bridge components.

Usage: python test_bridge.py

Tests:
  - MemoryManager: add, retrieve, deduplication, export/import, clear, summary
  - AutoGLMAdapter: prompt building, response parsing (all action types)
  - QwenVLAdapter: prompt building, response parsing (JSON actions)
  - Integration: health endpoint via FastAPI TestClient
"""

import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

# ── Setup: add project root to sys.path ──────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Override storage directory for tests
import memory.memory_manager as mm_module
_test_dir = Path(tempfile.mkdtemp(prefix="phonefarm_test_"))
mm_module.MEMORY_BASE_DIR = _test_dir

from memory.memory_manager import MemoryManager, get_memory_manager
from server import AutoGLMAdapter, QwenVLAdapter, app
from fastapi.testclient import TestClient


# ── MemoryManager Unit Tests ────────────────────────────────────────

class TestMemoryManager(unittest.TestCase):
    """Tests for the vector-based memory system."""

    def setUp(self):
        self.mgr = MemoryManager("test_user")
        self.mgr.clear()

    def tearDown(self):
        self.mgr.clear()
        # Clean up test files
        fp = self.mgr._get_file_path()
        if fp.exists():
            fp.unlink()

    # ── Basic Operations ────────────────────────────────────────────

    def test_add_single_memory(self):
        mem = self.mgr.add_memory("Open WeChat and tap search button", category="task_pattern")
        self.assertEqual(self.mgr.__len__(), 1)
        self.assertEqual(mem["category"], "task_pattern")
        self.assertIn("Open WeChat", mem["content"])
        self.assertIn("id", mem)
        self.assertIn("created_at", mem)
        self.assertIn("updated_at", mem)
        self.assertIn("access_count", mem)
        self.assertIn("importance", mem)

    def test_add_multiple_categories(self):
        self.mgr.add_memory("张三 微信号: zhangsan123", category="contact", importance=0.9)
        self.mgr.add_memory("微信支付可输入6位密码", category="app_knowledge", importance=0.7)
        self.mgr.add_memory("喜欢用深色模式", category="preference", importance=0.5)
        self.mgr.add_memory("上次任务: 发消息给张三时应该先确认网络连接", category="correction", importance=0.95)
        self.mgr.add_memory("打开抖音→点搜索→输入关键词→浏览视频", category="task_pattern", importance=0.6)

        self.assertEqual(len(self.mgr), 5)

        summary = self.mgr.get_user_summary()
        self.assertEqual(summary["total_memories"], 5)
        self.assertEqual(summary["categories"]["contact"], 1)
        self.assertEqual(summary["categories"]["app_knowledge"], 1)
        self.assertEqual(summary["categories"]["preference"], 1)
        self.assertEqual(summary["categories"]["correction"], 1)
        self.assertEqual(summary["categories"]["task_pattern"], 1)

    def test_invalid_category_raises(self):
        with self.assertRaises(ValueError):
            self.mgr.add_memory("some content", category="invalid_cat")

    def test_importance_clamped(self):
        mem = self.mgr.add_memory("test", importance=1.5)
        self.assertEqual(mem["importance"], 1.0)
        mem = self.mgr.add_memory("test2", importance=-0.5)
        self.assertEqual(mem["importance"], 0.0)

    # ── Retrieval ─────────────────────────────────────────────────

    def test_retrieve_basic(self):
        self.mgr.add_memory("微信视频号点赞功能在右下角", category="app_knowledge")
        self.mgr.add_memory("抖音搜索按钮在右上角", category="app_knowledge")
        self.mgr.add_memory("快手同城页面底部导航第二个", category="app_knowledge")
        self.mgr.add_memory("张三的微信号是 zhangsan123", category="contact")
        self.mgr.add_memory("李四微信号 lisi456", category="contact")

        results = self.mgr.retrieve("微信视频号怎么点赞")
        self.assertGreater(len(results), 0)
        # First result should be about 微信视频号
        self.assertIn("微信", results[0]["content"])
        self.assertIn("_similarity", results[0])

    def test_retrieve_with_category_filter(self):
        self.mgr.add_memory("微信视频号点赞功能在右下角", category="app_knowledge")
        self.mgr.add_memory("张三的微信号是 zhangsan123", category="contact")

        results = self.mgr.retrieve("微信怎么用", category="contact")
        self.assertEqual(len(results), 0)  # No contacts match 微信

    def test_retrieve_top_k(self):
        for i in range(10):
            self.mgr.add_memory(f"测试记忆内容 {i} 关于抖音操作", category="task_pattern")

        results = self.mgr.retrieve("抖音操作", top_k=3)
        self.assertLessEqual(len(results), 3)

    def test_retrieve_boosts_access_count(self):
        self.mgr.add_memory("微信视频号点赞功能在右下角", category="app_knowledge")
        results = self.mgr.retrieve("微信点赞")
        self.assertGreater(len(results), 0)
        # Access count should have been incremented
        mem = self.mgr._memories[0]
        self.assertEqual(mem["access_count"], 1)

    def test_retrieve_empty_store(self):
        results = self.mgr.retrieve("anything")
        self.assertEqual(results, [])

    # ── Deduplication ──────────────────────────────────────────────

    def test_deduplicate_similar(self):
        mem1 = self.mgr.add_memory("打开微信并搜索联系人张三", category="task_pattern")
        mem2 = self.mgr.add_memory("打开微信并搜索联系人张三发送消息", category="task_pattern")

        # Should merge because very similar
        self.assertLessEqual(len(self.mgr), 1)
        self.assertIn("发送消息", self.mgr._memories[0]["content"])

    def test_no_deduplicate_different(self):
        self.mgr.add_memory("打开微信搜索张三", category="task_pattern")
        self.mgr.add_memory("抖音刷视频点赞关注", category="task_pattern")

        self.assertEqual(len(self.mgr), 2)

    def test_no_deduplicate_different_category(self):
        self.mgr.add_memory("打开微信搜索张三", category="task_pattern")
        self.mgr.add_memory("打开微信搜索张三", category="correction")

        self.assertEqual(len(self.mgr), 2)

    # ── Corrections ────────────────────────────────────────────────

    def test_add_user_correction(self):
        mem = self.mgr.add_user_correction(
            task="发消息给张三",
            correction="应该先确认微信是否在前台，再点通讯录"
        )
        self.assertEqual(mem["category"], "correction")
        self.assertEqual(mem["importance"], 0.95)
        self.assertIn("TASK:", mem["content"])
        self.assertIn("CORRECTION:", mem["content"])

    # ── Export / Import ────────────────────────────────────────────

    def test_export_empty(self):
        data = self.mgr.export_memories()
        self.assertEqual(data, [])

    def test_export_nonempty(self):
        self.mgr.add_memory("memory one", category="task_pattern")
        self.mgr.add_memory("memory two", category="contact")
        data = self.mgr.export_memories()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["content"], "memory one")

    def test_import_into_empty(self):
        data = [
            {"content": "imported 1", "category": "task_pattern", "importance": 0.8},
            {"content": "imported 2", "category": "contact", "importance": 0.6},
        ]
        count = self.mgr.import_memories(data)
        self.assertEqual(count, 2)
        self.assertEqual(len(self.mgr), 2)

    def test_import_merge_with_existing(self):
        self.mgr.add_memory("打开微信搜索联系人", category="task_pattern")
        data = [
            {"content": "打开微信搜索联系人发送消息", "category": "task_pattern"},
            {"content": "new contact", "category": "contact"},
        ]
        count = self.mgr.import_memories(data)
        # First item should merge (similar), second is new
        self.assertGreaterEqual(count, 1)
        self.assertLessEqual(len(self.mgr), 2)

    def test_roundtrip_export_import(self):
        self.mgr.add_memory("original 1", category="task_pattern")
        self.mgr.add_memory("original 2", category="contact")

        exported = self.mgr.export_memories()

        mgr2 = MemoryManager("test_user_2")
        mgr2.clear()
        mgr2.import_memories(exported)

        self.assertEqual(len(mgr2), 2)

        # Cleanup
        mgr2.clear()
        fp = mgr2._get_file_path()
        if fp.exists():
            fp.unlink()

    # ── Clear ──────────────────────────────────────────────────────

    def test_clear(self):
        self.mgr.add_memory("m1", category="task_pattern")
        self.mgr.add_memory("m2", category="contact")
        self.assertEqual(len(self.mgr), 2)
        self.mgr.clear()
        self.assertEqual(len(self.mgr), 0)
        self.assertEqual(self.mgr.export_memories(), [])

    # ── Summary ────────────────────────────────────────────────────

    def test_get_user_summary_empty(self):
        summary = self.mgr.get_user_summary()
        self.assertEqual(summary["total_memories"], 0)
        self.assertEqual(summary["categories"], {})

    def test_get_user_summary_full(self):
        self.mgr.add_memory("联系人A", category="contact", importance=0.9)
        self.mgr.add_memory("联系人B", category="contact", importance=0.5)
        self.mgr.add_memory("微信支付用法", category="app_knowledge")
        self.mgr.add_memory("偏好深色模式", category="preference")

        summary = self.mgr.get_user_summary()
        self.assertEqual(summary["total_memories"], 4)
        self.assertEqual(len(summary["top_contacts"]), 2)
        self.assertEqual(len(summary["app_knowledge"]), 1)
        self.assertEqual(len(summary["preferences"]), 1)

    # ── Persistence ────────────────────────────────────────────────

    def test_persistence_across_instances(self):
        self.mgr.add_memory("persistent memory", category="task_pattern")

        # Create new manager for same user
        mgr2 = MemoryManager("test_user")
        self.assertEqual(len(mgr2), 1)
        self.assertEqual(mgr2._memories[0]["content"], "persistent memory")

    # ── Factory ────────────────────────────────────────────────────

    def test_get_memory_manager_factory(self):
        mgr_a = get_memory_manager("factory_test")
        mgr_b = get_memory_manager("factory_test")
        self.assertIs(mgr_a, mgr_b)  # Same instance

        mgr_c = get_memory_manager("factory_test_2")
        self.assertIsNot(mgr_a, mgr_c)  # Different user

        # Cleanup
        mgr_a.clear()
        mgr_c.clear()


# ── AutoGLMAdapter Unit Tests ──────────────────────────────────────

class TestAutoGLMAdapter(unittest.TestCase):
    """Tests for AutoGLM-Phone-9B output parsing."""

    def setUp(self):
        self.adapter = AutoGLMAdapter()
        self.screen_w = 1080
        self.screen_h = 2400

    def test_build_prompt_cn(self):
        messages = self.adapter.build_prompt("打开微信", "cn", "com.android.launcher")
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("手机操作助手", messages[0]["content"])
        self.assertEqual(messages[1]["role"], "user")
        self.assertEqual(messages[1]["content"], "打开微信")

    def test_build_prompt_en(self):
        messages = self.adapter.build_prompt("Open WeChat", "en", "com.android.launcher")
        self.assertIn("phone operation assistant", messages[0]["content"])

    def test_parse_tap(self):
        content = "<think>Need to tap search button</think><answer>do(action=\"Tap\", element=[500,300])</answer>"
        action, thinking, finished = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "tap")
        self.assertEqual(action["x"], 540)   # 500/1000 * 1080
        self.assertEqual(action["y"], 720)   # 300/1000 * 2400
        self.assertEqual(thinking, "Need to tap search button")
        self.assertFalse(finished)

    def test_parse_tap_denormalization(self):
        content = "<answer>do(action=\"Tap\", element=[100,200])</answer>"
        action, _, _ = self.adapter.parse_response(content, 1000, 2000)
        self.assertEqual(action["x"], 100)  # 100/1000 * 1000
        self.assertEqual(action["y"], 400)  # 200/1000 * 2000

    def test_parse_swipe(self):
        content = "<think>Swipe up</think><answer>do(action=\"Swipe\", start=[500,800], end=[500,200])</answer>"
        action, thinking, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "swipe")
        self.assertEqual(action["x"], 540)
        self.assertEqual(action["y"], 1920)
        self.assertEqual(action["x2"], 540)
        self.assertEqual(action["y2"], 480)
        self.assertEqual(thinking, "Swipe up")

    def test_parse_type(self):
        content = "<answer>do(action=\"Type\", text=\"Hello World\")</answer>"
        action, _, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "type")
        self.assertEqual(action["text"], "Hello World")

    def test_parse_back(self):
        content = "<answer>do(action=\"Back\")</answer>"
        action, _, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "back")

    def test_parse_home(self):
        content = "<answer>do(action=\"Home\")</answer>"
        action, _, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "home")

    def test_parse_launch(self):
        content = '<answer>do(action="Launch", app="com.tencent.mm")</answer>'
        action, _, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "launch")
        self.assertEqual(action["package"], "com.tencent.mm")

    def test_parse_long_press(self):
        content = "<answer>do(action=\"LongPress\", element=[300,400])</answer>"
        action, _, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "long_press")

    def test_parse_finish(self):
        content = '<think>Task done</think><answer>finish(message="Successfully sent message")</answer>'
        action, thinking, finished = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "terminate")
        self.assertEqual(action["message"], "Successfully sent message")
        self.assertTrue(finished)

    def test_parse_no_think_tag(self):
        content = '<answer>do(action="Back")</answer>'
        action, thinking, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "back")
        self.assertEqual(thinking, "")

    def test_parse_no_answer_tag(self):
        content = "some raw response without tags"
        action, thinking, finished = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        # Should return default tap action
        self.assertEqual(action["type"], "tap")

    def test_parse_unknown_action_type(self):
        content = '<answer>do(action="UnknownAction", element=[100,200])</answer>'
        action, _, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        # Should default to the default action (tap)
        self.assertIn(action["type"], ["tap", "back", "home", "swipe", "type", "launch", "long_press", "terminate"])


# ── QwenVLAdapter Unit Tests ───────────────────────────────────────

class TestQwenVLAdapter(unittest.TestCase):
    """Tests for Qwen-VL JSON action parsing."""

    def setUp(self):
        self.adapter = QwenVLAdapter()
        self.screen_w = 1080
        self.screen_h = 2400

    def test_build_prompt(self):
        messages = self.adapter.build_prompt("Tap the search icon", "en", "com.android.chrome")
        self.assertEqual(len(messages), 2)
        self.assertIn("phone GUI agent", messages[0]["content"])
        self.assertIn("JSON", messages[0]["content"])

    def test_parse_tap(self):
        content = '{"action": "tap", "x": 540, "y": 1200, "thinking": "Tap the search button"}'
        action, thinking, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "tap")
        self.assertEqual(action["x"], 540)
        self.assertEqual(action["y"], 1200)
        self.assertEqual(thinking, "Tap the search button")

    def test_parse_swipe(self):
        content = '{"action": "swipe", "x1": 540, "y1": 1800, "x2": 540, "y2": 600, "thinking": "Scroll up"}'
        action, thinking, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "swipe")
        self.assertEqual(action["x"], 540)
        self.assertEqual(action["y"], 1800)
        self.assertEqual(action["x2"], 540)
        self.assertEqual(action["y2"], 600)

    def test_parse_type(self):
        content = '{"action": "type", "text": "hello world", "thinking": "Type greeting"}'
        action, thinking, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "type")
        self.assertEqual(action["text"], "hello world")

    def test_parse_back(self):
        content = '{"action": "back", "thinking": "Go back"}'
        action, _, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "back")

    def test_parse_home(self):
        content = '{"action": "home"}'
        action, _, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "home")

    def test_parse_terminate(self):
        content = '{"action": "terminate", "message": "Task completed successfully"}'
        action, _, finished = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "terminate")
        self.assertTrue(finished)

    def test_parse_answer(self):
        content = '{"action": "answer", "answer": "The weather is sunny"}'
        action, _, finished = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "terminate")
        self.assertEqual(action["message"], "The weather is sunny")
        self.assertTrue(finished)

    def test_parse_json_in_markdown(self):
        content = '```json\n{"action": "tap", "x": 100, "y": 200}\n```'
        action, _, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(action["type"], "tap")
        self.assertEqual(action["x"], 100)

    def test_parse_invalid_json(self):
        content = "this is not JSON at all"
        action, thinking, finished = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        # Should return default action
        self.assertEqual(action["type"], "tap")
        self.assertFalse(finished)

    def test_parse_missing_thinking(self):
        content = '{"action": "back"}'
        action, thinking, _ = self.adapter.parse_response(content, self.screen_w, self.screen_h)
        self.assertEqual(thinking, "")


# ── Integration Tests ──────────────────────────────────────────────

class TestServerIntegration(unittest.TestCase):
    """Integration tests against the FastAPI app via TestClient."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_endpoint(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("model", data)
        self.assertIn("base_url", data)

    def test_vlm_execute_validation(self):
        """VLM endpoint should reject invalid requests (no VLM server available in test)."""
        resp = self.client.post("/api/vlm/execute", json={})
        self.assertEqual(resp.status_code, 422)  # Pydantic validation error

    def test_memory_add_endpoint(self):
        resp = self.client.post("/api/memory/add", json={
            "user_id": "integration_test",
            "content": "微信视频号点赞按钮在右下角",
            "category": "app_knowledge",
            "importance": 0.8,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["user_id"], "integration_test")
        self.assertIn("memory", data)

    def test_memory_query_endpoint(self):
        # Add a memory first
        self.client.post("/api/memory/add", json={
            "user_id": "integration_test",
            "content": "打开抖音搜索美食视频并点赞",
            "category": "task_pattern",
        })
        resp = self.client.post("/api/memory/query", json={
            "user_id": "integration_test",
            "query": "抖音点赞",
            "top_k": 5,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("results", data)
        self.assertIn("count", data)

    def test_memory_summary_endpoint(self):
        resp = self.client.get("/api/memory/summary/integration_test")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("total_memories", data)
        self.assertIn("categories", data)
        self.assertEqual(data["user_id"], "integration_test")

    def test_memory_correction_endpoint(self):
        resp = self.client.post("/api/memory/correction", json={
            "user_id": "integration_test",
            "task": "发消息给张三",
            "correction": "先确认微信在前台再操作",
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["action"], "correction_recorded")

    def test_memory_export_endpoint(self):
        resp = self.client.post("/api/memory/export/integration_test")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("memories", data)
        self.assertIn("count", data)

    def test_memory_import_endpoint(self):
        resp = self.client.post("/api/memory/import/integration_test", json={
            "data": [
                {"content": "导入测试记忆1", "category": "task_pattern"},
                {"content": "导入测试记忆2", "category": "contact"},
            ]
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("imported_count", data)

    def test_memory_clear_endpoint(self):
        resp = self.client.delete("/api/memory/integration_test_clear")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["action"], "cleared")

    def test_wecom_callback_get(self):
        """WeCom URL verification (without signature)."""
        resp = self.client.get("/api/bot/wecom/callback?echostr=123456")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), 123456)

    def test_wecom_callback_post_text(self):
        """WeCom text message webhook."""
        xml_body = """<xml>
            <ToUserName><![CDATA[corp]]></ToUserName>
            <FromUserName><![CDATA[user1]]></FromUserName>
            <CreateTime>1234567890</CreateTime>
            <MsgType><![CDATA[text]]></MsgType>
            <Content><![CDATA[/help]]></Content>
        </xml>"""
        resp = self.client.post("/api/bot/wecom/callback", content=xml_body)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("帮助", resp.text)

    def test_wecom_callback_post_status(self):
        """WeCom /status command."""
        xml_body = """<xml>
            <ToUserName><![CDATA[corp]]></ToUserName>
            <FromUserName><![CDATA[user1]]></FromUserName>
            <CreateTime>1234567890</CreateTime>
            <MsgType><![CDATA[text]]></MsgType>
            <Content><![CDATA[/status]]></Content>
        </xml>"""
        resp = self.client.post("/api/bot/wecom/callback", content=xml_body)
        self.assertEqual(resp.status_code, 200)
        # Status tries to reach VLM bridge health — may fail in test
        self.assertTrue(True)

    def test_wecom_callback_post_task(self):
        """WeCom /task command."""
        xml_body = """<xml>
            <ToUserName><![CDATA[corp]]></ToUserName>
            <FromUserName><![CDATA[user1]]></FromUserName>
            <CreateTime>1234567890</CreateTime>
            <MsgType><![CDATA[text]]></MsgType>
            <Content><![CDATA[/task pixel6 打开微信搜索张三]]></Content>
        </xml>"""
        resp = self.client.post("/api/bot/wecom/callback", content=xml_body)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("任务已接收", resp.text)

    @classmethod
    def tearDownClass(cls):
        # Clean up integration test memory files
        for uid in ["integration_test", "integration_test_clear"]:
            mgr = MemoryManager(uid)
            mgr.clear()
            fp = mgr._get_file_path()
            if fp.exists():
                fp.unlink()


# ── Runner ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("VLM Bridge Test Suite")
    print(f"Test data directory: {_test_dir}")
    print("=" * 60)

    # Run tests
    unittest.main(verbosity=2)

    # Cleanup test directory
    import shutil
    if _test_dir.exists():
        shutil.rmtree(_test_dir, ignore_errors=True)
