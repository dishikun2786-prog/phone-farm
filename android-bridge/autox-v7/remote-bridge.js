/**
 * remote-bridge.js — AutoX v7 原生远程桥接模块
 *
 * 使用 AutoX v7 Rhino 原生 API (web.newWebSocket, device.*, images.* 等)，
 * 不依赖 compat.js 适配层。
 *
 * 依赖 (按顺序加载):
 *   1. lib/ws-client.js       — WebSocket 客户端
 *   2. lib/device-info.js     — 设备信息采集
 *   3. lib/script-loader.js   — 脚本加载 + OTA 部署
 *   4. lib/task-context.js    — 任务上下文管理
 *
 * 使用方式: 在 AutoX APP 中依次加载上述 4 个 lib 文件，然后加载本文件。
 */

var RemoteBridge = (function () {
  'use strict';

  // ==========================================================================
  // 配置
  // ==========================================================================

  var s = storages.create('phonefarm');

  var CONFIG = {
    serverUrl: s.get('remote_server_url', 'ws://100.64.0.1:8443/ws/device'),
    authToken: s.get('remote_auth_token', 'device-auth-token-change-me'),
    heartbeatInterval: 5000,
    screenshotInterval: 0,
    screenshotQuality: 50,
    screenshotScale: 0.3,
  };

  // ==========================================================================
  // 内部状态
  // ==========================================================================

  var ws = null;
  var heartbeatTimer = null;
  var screenshotTimer = null;

  // ==========================================================================
  // WebSocket 连接管理
  // ==========================================================================

  function connect() {
    if (ws && ws.isOpen && ws.isOpen()) return;

    log('[RemoteBridge] 连接服务器: ' + CONFIG.serverUrl);
    ws = new WsClient(CONFIG.serverUrl, { reconnectMs: 10000 });

    TaskContext.bindWs(ws);

    ws.onOpen = function () {
      log('[RemoteBridge] 已连接，发送认证...');
      var info = DeviceInfo.collect();
      ws.send({
        type: 'auth',
        token: CONFIG.authToken,
        device_id: info.device_id,
        tailscale_ip: info.tailscale_ip,
        model: info.model,
        android_version: info.android_version,
        deeke_version: info.autoX_version,
        runtime: 'autox',
      });
    };

    ws.onMessage = function (raw) {
      try {
        var msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        handleMessage(msg);
      } catch (e) {
        log('[RemoteBridge] 解析消息失败: ' + e.message);
      }
    };

    ws.onClose = function (code, reason) {
      log('[RemoteBridge] 断开连接: ' + code + ' ' + reason);
      stopHeartbeat();
      stopScreenshot();
    };

    ws.onError = function (err) {
      log('[RemoteBridge] 连接错误: ' + JSON.stringify(err));
    };

    ws.connect();
  }

  // ==========================================================================
  // 消息路由
  // ==========================================================================

  function handleMessage(msg) {
    switch (msg.type) {
      case 'auth_ok':
        log('[RemoteBridge] 认证成功');
        startHeartbeat();
        if (CONFIG.screenshotInterval > 0) startScreenshot();
        reportScriptVersions();
        toast('远程服务已连接');
        break;

      case 'auth_error':
        log('[RemoteBridge] 认证失败: ' + msg.message);
        toast('远程认证失败: ' + msg.message);
        break;

      case 'start_task':
        startTask(msg);
        break;

      case 'stop_task':
        stopTask(msg.task_id);
        break;

      case 'command':
        executeCommand(msg);
        break;

      case 'screenshot':
        sendScreenshot();
        break;

      case 'set_config':
        updateConfig(msg);
        break;

      case 'deploy_scripts':
        handleDeploy(msg);
        break;

      case 'check_scripts':
        reportScriptVersions();
        break;
    }
  }

  // ==========================================================================
  // 心跳
  // ==========================================================================

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(function () {
      if (ws && ws.isOpen()) {
        var data = DeviceInfo.getHeartbeatData();
        ws.send({
          type: 'heartbeat',
          battery: data.battery,
          current_app: data.current_app,
          screen_on: data.screen_on,
        });
      }
    }, CONFIG.heartbeatInterval);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  // ==========================================================================
  // 截图
  // ==========================================================================

  function startScreenshot() {
    stopScreenshot();
    screenshotTimer = setInterval(function () { sendScreenshot(); }, CONFIG.screenshotInterval);
  }

  function stopScreenshot() {
    if (screenshotTimer) { clearInterval(screenshotTimer); screenshotTimer = null; }
  }

  function sendScreenshot() {
    if (!ws || !ws.isOpen()) return;
    try {
      var img = images.captureScreen();
      if (img) {
        var w = img.getWidth();
        var h = img.getHeight();
        var scaled = images.scale(img, Math.floor(w * CONFIG.screenshotScale), Math.floor(h * CONFIG.screenshotScale));
        var b64 = images.toBase64(scaled, 'jpeg');
        ws.send({ type: 'screenshot', data: b64 });
        img.recycle();
        scaled.recycle();
      }
    } catch (e) { /* 无障碍服务未激活时截图可能失败 */ }
  }

  // ==========================================================================
  // 任务控制
  // ==========================================================================

  function startTask(msg) {
    try {
      TaskContext.start(msg.task_id, msg.config);
      log('[RemoteBridge] 启动任务: ' + msg.task_id + ' 脚本: ' + msg.script);

      ws.send({
        type: 'task_status',
        task_id: msg.task_id,
        status: 'running',
        step: 0,
        message: '任务启动中...',
      });

      var scriptPath = ScriptLoader.resolvePath(msg.script.indexOf('tasks/') === 0 ? msg.script : 'tasks/' + msg.script);

      log('[RemoteBridge] 加载脚本: ' + scriptPath);
      engines.execScriptFile(scriptPath, { arguments: msg.config || {} });

    } catch (e) {
      log('[RemoteBridge] 启动任务失败: ' + e.message);
      ws.send({
        type: 'task_status',
        task_id: msg.task_id,
        status: 'failed',
        step: 0,
        message: '启动失败: ' + e.message,
      });
    }
  }

  function stopTask(taskId) {
    log('[RemoteBridge] 停止任务: ' + taskId);
    try {
      engines.stopAll();
      ws.send({
        type: 'task_status',
        task_id: taskId,
        status: 'stopped',
        step: 100,
        message: '任务已停止',
      });
    } catch (e) {
      log('[RemoteBridge] 停止任务失败: ' + e.message);
    }
  }

  // ==========================================================================
  // 命令执行
  // ==========================================================================

  function executeCommand(cmd) {
    try {
      switch (cmd.action) {
        case 'tap':
          click(cmd.params.x, cmd.params.y);
          break;
        case 'swipe':
          swipe(cmd.params.x1, cmd.params.y1, cmd.params.x2, cmd.params.y2, cmd.params.duration || 300);
          break;
        case 'type':
          if (cmd.params.text) inputText(cmd.params.text);
          break;
        case 'launch':
          if (cmd.params.package) app.launch(cmd.params.package);
          break;
        case 'back':
          back();
          break;
        case 'home':
          home();
          break;
        case 'screenshot':
          sendScreenshot();
          break;
      }
    } catch (e) {
      log('[RemoteBridge] 命令执行失败: ' + e.message);
    }
  }

  // ==========================================================================
  // 配置更新
  // ==========================================================================

  function updateConfig(msg) {
    if (msg.key && msg.value !== undefined) {
      var s2 = storages.create('phonefarm');
      s2.put(msg.key, msg.value);
      log('[RemoteBridge] 配置更新: ' + msg.key + ' = ' + msg.value);
    }
  }

  // ==========================================================================
  // OTA 脚本部署
  // ==========================================================================

  function handleDeploy(msg) {
    log('[RemoteBridge] 收到脚本部署包, 版本: ' + (msg.version || 'unknown'));
    if (!msg.files || Object.keys(msg.files).length === 0) {
      log('[RemoteBridge] 部署包为空');
      return;
    }

    var result = ScriptLoader.deploy(msg.files, msg.version);

    if (ws && ws.isOpen()) {
      ws.send({
        type: 'deploy_result',
        version: msg.version || 'unknown',
        deployed: result.deployed,
        failed: result.failed,
      });
    }
  }

  function reportScriptVersions() {
    if (!ws || !ws.isOpen()) return;
    var info = ScriptLoader.collectVersions();
    ws.send({
      type: 'script_versions',
      installedVersion: info.installedVersion,
      deployedAt: info.deployedAt,
      files: info.files,
    });
    log('[RemoteBridge] 脚本版本: ' + info.installedVersion);
  }

  // ==========================================================================
  // 清理
  // ==========================================================================

  function cleanup() {
    stopHeartbeat();
    stopScreenshot();
    if (ws) { ws.close(); ws = null; }
  }

  TaskContext.registerCleanup(cleanup);

  // ==========================================================================
  // 公开接口
  // ==========================================================================

  return {
    connect: connect,
    disconnect: cleanup,
    sendScreenshot: sendScreenshot,
    isConnected: function () { return ws && ws.isOpen(); },
  };
})();

// ==========================================================================
// 导出到全局作用域 (兼容 DeekeScript 任务脚本)
// ==========================================================================

global.remoteBridge = {
  sendTaskStatus: function (status, step, message) {
    if (RemoteBridge.isConnected()) {
      // Handled by TaskContext
    }
  },
  sendTaskResult: function (status, stats) {
    // Delegated to TaskContext
    if (status === 'completed') TaskContext.complete(stats);
    else TaskContext.fail(stats ? stats.error : 'unknown');
  },
  sendLog: function (level, message) {
    log('[' + (level || 'info') + '] ' + (message || ''));
  },
  updateConfig: function (key, value) {
    storages.create('phonefarm').put(key, value);
  },
  reconnect: function () {
    RemoteBridge.disconnect();
    RemoteBridge.connect();
  },
  disconnect: function () {
    RemoteBridge.disconnect();
  },
};

// ==========================================================================
// 启动
// ==========================================================================

log('[RemoteBridge] AutoX v7 远程桥接模块启动');
log('[RemoteBridge] 服务器: ' + CONFIG.serverUrl);
RemoteBridge.connect();
