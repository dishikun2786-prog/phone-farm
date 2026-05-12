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
const SCRIPTS_DIR = '/sdcard/DeekeScript/scripts/';

function getDeviceInfo() {
  return {
    device_id: Device.androidId || ('device-' + Device.serial),
    model: Device.model || 'Unknown',
    android_version: Device.release || 'Unknown',
    deeke_version: App.versionName || 'Unknown',
    tailscale_ip: Storage.get('tailscale_ip') || 'unknown',
    script_version: getCurrentScriptVersion(),
  };
}

/** Read the installed script version from external scripts directory */
function getCurrentScriptVersion() {
  try {
    var versionPath = SCRIPTS_DIR + 'version.json';
    if (Files.exists(versionPath)) {
      var raw = Files.read(versionPath);
      var manifest = JSON.parse(raw);
      return manifest.version || '0.0.0';
    }
  } catch (e) {}
  return 'builtin'; // running from bundled APK scripts
}

/** Check if external scripts directory exists and has valid version.json */
function hasExternalScripts() {
  try {
    return Files.exists(SCRIPTS_DIR + 'version.json');
  } catch (e) {
    return false;
  }
}

/** Load a script from external directory, fall back to bundled */
function requireScript(filename) {
  var extPath = SCRIPTS_DIR + filename;
  try {
    if (Files.exists(extPath)) {
      return Files.read(extPath);
    }
  } catch (e) {}
  return null;
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
      // Report script versions so server knows what's installed
      reportScriptVersions();
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

    case 'deploy_scripts':
      handleDeployScripts(msg);
      break;

    case 'check_scripts':
      reportScriptVersions();
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

    // Use DeekeScript 的脚本引擎执行任务
    // Prefer external (OTA-deployed) scripts, fall back to bundled
    var scriptPath = SCRIPTS_DIR + msg.script + '.js';
    if (!Files.exists(scriptPath)) {
      scriptPath = 'tasks/' + msg.script + '.js';
      Log.log('[RemoteBridge] 使用内置脚本: ' + scriptPath);
    } else {
      Log.log('[RemoteBridge] 使用外部脚本: ' + scriptPath);
    }
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

// ============== OTA 脚本部署 ==============

/**
 * Handle incoming script deployment from control server.
 * msg.files: { "filename.js": "<base64-encoded-content>", ... }
 * msg.version: "1.0.1"
 */
function handleDeployScripts(msg) {
  Log.log('[RemoteBridge] 收到脚本部署包, 版本: ' + (msg.version || 'unknown'));
  if (!msg.files || Object.keys(msg.files).length === 0) {
    Log.log('[RemoteBridge] 部署包为空');
    return;
  }

  var deployed = [];
  var failed = [];

  try {
    // Ensure scripts directory exists
    if (!Files.exists(SCRIPTS_DIR)) {
      Files.create(SCRIPTS_DIR);
    }

    var filenames = Object.keys(msg.files);
    for (var i = 0; i < filenames.length; i++) {
      var filename = filenames[i];
      try {
        var content = Base64.decode(msg.files[filename]);
        Files.write(SCRIPTS_DIR + filename, content);
        deployed.push(filename);
        Log.log('[RemoteBridge] 已部署: ' + filename);
      } catch (e) {
        failed.push(filename + ': ' + e.message);
        Log.log('[RemoteBridge] 部署失败: ' + filename + ' - ' + e.message);
      }
    }

    // Write version manifest
    if (deployed.length > 0) {
      try {
        Files.write(SCRIPTS_DIR + 'deployed_at.txt', new Date().toISOString());
      } catch (e) {}
    }
  } catch (e) {
    Log.log('[RemoteBridge] 部署异常: ' + e.message);
  }

  // Report back
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'deploy_result',
      version: msg.version || 'unknown',
      deployed: deployed,
      failed: failed,
    }));
  }

  if (deployed.length > 0) {
    FloatDialogs.toast('脚本已更新: ' + deployed.length + ' 个文件');
  }
}

/** Report current script versions back to control server */
function reportScriptVersions() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  var versions = {};
  var installedVersion = 'builtin';

  try {
    if (hasExternalScripts()) {
      var raw = Files.read(SCRIPTS_DIR + 'version.json');
      var manifest = JSON.parse(raw);
      installedVersion = manifest.version || '0.0.0';

      var filenames = Object.keys(manifest.files || {});
      for (var i = 0; i < filenames.length; i++) {
        var fn = filenames[i];
        var extPath = SCRIPTS_DIR + fn;
        versions[fn] = {
          manifestVersion: manifest.files[fn].version || '0.0.0',
          exists: Files.exists(extPath),
        };
      }
    }

    var deployedAt = '';
    try {
      if (Files.exists(SCRIPTS_DIR + 'deployed_at.txt')) {
        deployedAt = Files.read(SCRIPTS_DIR + 'deployed_at.txt').trim();
      }
    } catch (e) {}
  } catch (e) {}

  ws.send(JSON.stringify({
    type: 'script_versions',
    installedVersion: installedVersion,
    deployedAt: deployedAt,
    files: versions,
  }));

  Log.log('[RemoteBridge] 脚本版本: ' + installedVersion + ' (deployed: ' + deployedAt + ')');
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
