/**
 * remote-bridge.js — DeekeScript 远程桥接模块
 *
 * 功能:
 * 1. WebSocket 连接到控制服务器
 * 2. 上报设备状态 (心跳)
 * 3. 接收并执行远程任务指令
 * 4. 截图回传
 * 5. 任务状态上报
 *
 * 使用方式: 在 DeekeScript APP 中加载此脚本，配置服务器地址和认证令牌
 */

// ============== 配置区 ==============
const CONFIG = {
  // 控制服务器 WebSocket 地址 (使用 Tailscale IP)
  serverUrl: Storage.get('remote_server_url') || 'ws://100.64.0.1:8443/ws/device',

  // 设备认证令牌 (与控制服务器 DEVICE_AUTH_TOKEN 一致)
  authToken: Storage.get('remote_auth_token') || 'device-auth-token-change-me',

  // 心跳间隔 (毫秒)
  heartbeatInterval: 5000,

  // 截图间隔 (毫秒, 0 表示不自动截图)
  screenshotInterval: 0,

  // 截图质量 (0-100)
  screenshotQuality: 50,

  // 截图缩放比例 (0.1-1.0)
  screenshotScale: 0.3,

  // 重连间隔 (毫秒)
  reconnectInterval: 10000,
};

// ============== 设备信息 ==============
function getDeviceInfo() {
  return {
    device_id: Device.androidId || ('device-' + Device.serial),
    model: Device.model || 'Unknown',
    android_version: Device.release || 'Unknown',
    deeke_version: App.versionName || 'Unknown',
    tailscale_ip: Storage.get('tailscale_ip') || 'unknown',
  };
}

// ============== WebSocket 连接管理 ==============
let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let screenshotTimer = null;
let currentTaskId = null;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  Log.log('[RemoteBridge] 连接服务器: ' + CONFIG.serverUrl);
  ws = new WebSocket(CONFIG.serverUrl);

  ws.onOpen = function () {
    Log.log('[RemoteBridge] 已连接，发送认证...');
    const info = getDeviceInfo();
    ws.send(JSON.stringify({
      type: 'auth',
      token: CONFIG.authToken,
      device_id: info.device_id,
      tailscale_ip: info.tailscale_ip,
      model: info.model,
      android_version: info.android_version,
      deeke_version: info.deeke_version,
    }));
  };

  ws.onMessage = function (message) {
    try {
      const msg = JSON.parse(message);
      handleMessage(msg);
    } catch (e) {
      Log.log('[RemoteBridge] 解析消息失败: ' + e.message);
    }
  };

  ws.onClose = function (code, reason) {
    Log.log('[RemoteBridge] 断开连接: ' + code + ' ' + reason);
    ws = null;
    stopHeartbeat();
    stopScreenshot();
    scheduleReconnect();
  };

  ws.onError = function (error) {
    Log.log('[RemoteBridge] 连接错误: ' + JSON.stringify(error));
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  Log.log('[RemoteBridge] ' + (CONFIG.reconnectInterval / 1000) + '秒后重连...');
  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    connect();
  }, CONFIG.reconnectInterval);
}

// ============== 消息处理 ==============
function handleMessage(msg) {
  switch (msg.type) {
    case 'auth_ok':
      Log.log('[RemoteBridge] 认证成功');
      startHeartbeat();
      if (CONFIG.screenshotInterval > 0) {
        startScreenshot();
      }
      FloatDialogs.toast('远程服务已连接');
      break;

    case 'auth_error':
      Log.log('[RemoteBridge] 认证失败: ' + msg.message);
      FloatDialogs.toast('远程认证失败: ' + msg.message);
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
  }
}

// ============== 心跳 ==============
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(function () {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'heartbeat',
          battery: Device.battery || 0,
          current_app: App.currentPackage() || '',
          screen_on: Device.isScreenOn(),
        }));
      } catch (e) { /* ignore */ }
    }
  }, CONFIG.heartbeatInterval);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ============== 截图 ==============
function startScreenshot() {
  stopScreenshot();
  screenshotTimer = setInterval(function () {
    sendScreenshot();
  }, CONFIG.screenshotInterval);
}

function stopScreenshot() {
  if (screenshotTimer) {
    clearInterval(screenshotTimer);
    screenshotTimer = null;
  }
}

function sendScreenshot() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const img = Images.captureScreen();
    if (img) {
      const scaled = Images.scale(img, CONFIG.screenshotScale);
      const base64 = Images.toBase64(scaled, 'jpeg', CONFIG.screenshotQuality);
      ws.send(JSON.stringify({
        type: 'screenshot',
        data: base64,
      }));
      img.recycle();
      scaled.recycle();
    }
  } catch (e) {
    // 截图可能在无障碍服务未激活时失败
  }
}

// ============== 任务控制 ==============
function startTask(msg) {
  try {
    currentTaskId = msg.task_id;
    Log.log('[RemoteBridge] 启动任务: ' + msg.task_id + ' 脚本: ' + msg.script);

    // 通知服务器任务已开始
    sendTaskStatus('running', 0, '任务启动中...');

    // 保存任务配置到 Storage 供任务脚本读取
    if (msg.config) {
      Storage.put('remote_task_config_' + msg.task_id, JSON.stringify(msg.config));
    }

    // 使用 DeekeScript 的脚本引擎执行任务
    const scriptPath = 'tasks/' + msg.script + '.js';
    Engines.executeScript(scriptPath, msg.config || {});

    sendTaskStatus('running', 0, '任务已启动');
  } catch (e) {
    Log.log('[RemoteBridge] 启动任务失败: ' + e.message);
    sendTaskStatus('failed', 0, '启动失败: ' + e.message);
  }
}

function stopTask(taskId) {
  Log.log('[RemoteBridge] 停止任务: ' + taskId);
  try {
    Engines.stopAll();
    sendTaskStatus('stopped', 100, '任务已停止');
  } catch (e) {
    Log.log('[RemoteBridge] 停止任务失败: ' + e.message);
  }
  currentTaskId = null;
}

function sendTaskStatus(status, step, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'task_status',
    task_id: currentTaskId,
    status: status,
    step: step,
    message: message,
  }));
}

function sendTaskResult(status, stats) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'task_result',
    task_id: currentTaskId,
    status: status,
    stats: stats || {},
  }));
  currentTaskId = null;
}

// ============== 命令执行 ==============
function executeCommand(cmd) {
  try {
    switch (cmd.action) {
      case 'tap':
        Gesture.click(cmd.params.x, cmd.params.y);
        break;
      case 'swipe':
        Gesture.swipe(
          cmd.params.x1, cmd.params.y1,
          cmd.params.x2, cmd.params.y2,
          cmd.params.duration || 300
        );
        break;
      case 'type':
        // 使用 DeekeScript 的输入法键入文本
        if (cmd.params.text) {
          KeyBoards.inputText(cmd.params.text);
        }
        break;
      case 'launch':
        if (cmd.params.package) {
          App.launch(cmd.params.package);
        }
        break;
      case 'back':
        Common.back();
        break;
      case 'home':
        Common.home();
        break;
      case 'screenshot':
        sendScreenshot();
        break;
    }
  } catch (e) {
    Log.log('[RemoteBridge] 命令执行失败: ' + e.message);
  }
}

// ============== 配置更新 ==============
function updateConfig(msg) {
  if (msg.key && msg.value !== undefined) {
    Storage.put(msg.key, msg.value);
    Log.log('[RemoteBridge] 配置更新: ' + msg.key + ' = ' + msg.value);
  }
}

// ============== 清理函数 ==============
function cleanup() {
  stopHeartbeat();
  stopScreenshot();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try { ws.close(); } catch (e) { /* ignore */ }
    ws = null;
  }
}

// ============== 启动 ==============
Log.log('[RemoteBridge] 远程桥接模块启动');
Log.log('[RemoteBridge] 服务器: ' + CONFIG.serverUrl);
connect();

// 暴露全局接口 (供 ad-deeke 任务脚本调用)
global.remoteBridge = {
  sendTaskStatus: sendTaskStatus,
  sendTaskResult: sendTaskResult,
  sendLog: function (level, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'log',
        level: level,
        message: message,
      }));
    }
  },
  updateConfig: updateConfig,
  reconnect: function () {
    cleanup();
    connect();
  },
  disconnect: cleanup,
};

// 当脚本被停止时清理
Events.on('exit', function () {
  cleanup();
});
