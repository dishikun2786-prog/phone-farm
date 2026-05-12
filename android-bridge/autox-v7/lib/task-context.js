/**
 * task-context.js — AutoX v7 原生任务上下文管理
 *
 * 管理任务配置读写、进度上报、完成/失败通知、退出清理。
 * 所有持久化使用 storages (AutoX 原生)，不依赖 DeekeScript Storage。
 *
 * 用法:
 *   TaskContext.start(taskId, config);
 *   TaskContext.reportProgress(stats, current, total);
 *   TaskContext.complete(stats);
 *   TaskContext.fail(errorMsg);
 */

var TaskContext = (function () {
  'use strict';

  var STORAGE_NAME = 'phonefarm_tasks';
  var currentTaskId = null;
  var wsClient = null;

  /**
   * Bind to a WsClient instance for sending status updates.
   */
  function bindWs(client) {
    wsClient = client;
  }

  /**
   * Start tracking a task.
   */
  function start(taskId, config) {
    currentTaskId = taskId;
    if (config) {
      var s = storages.create(STORAGE_NAME);
      s.put('config_' + taskId, JSON.stringify(config));
    }
  }

  /**
   * Load task config (from engine arguments or storages fallback).
   */
  function loadConfig(taskId, defaultConfig) {
    defaultConfig = defaultConfig || {};
    try {
      var s = storages.create(STORAGE_NAME);
      var stored = s.get('config_' + (taskId || currentTaskId), null);
      if (stored) {
        var parsed = JSON.parse(stored);
        // Merge with defaults
        for (var k in defaultConfig) {
          if (defaultConfig.hasOwnProperty(k) && !(k in parsed)) {
            parsed[k] = defaultConfig[k];
          }
        }
        return parsed;
      }
    } catch (e) {}
    return defaultConfig;
  }

  /**
   * Send progress update via WebSocket.
   */
  function reportProgress(stats, current, total) {
    if (!wsClient || !wsClient.isOpen() || !currentTaskId) return;
    var pct = total > 0 ? Math.floor(current / total * 100) : 0;
    wsClient.send({
      type: 'task_status',
      task_id: currentTaskId,
      status: 'running',
      step: pct,
      message: 'views=' + (stats.views || 0) +
        ' likes=' + (stats.likes || 0) +
        ' follows=' + (stats.follows || 0),
    });
  }

  /**
   * Report task completion.
   */
  function complete(stats) {
    if (!wsClient || !wsClient.isOpen() || !currentTaskId) return;
    wsClient.send({
      type: 'task_result',
      task_id: currentTaskId,
      status: 'completed',
      stats: stats || {},
    });
    currentTaskId = null;
  }

  /**
   * Report task failure.
   */
  function fail(errorMsg) {
    if (!wsClient || !wsClient.isOpen() || !currentTaskId) return;
    wsClient.send({
      type: 'task_result',
      task_id: currentTaskId,
      status: 'failed',
      stats: { error: errorMsg || 'Unknown error' },
    });
    currentTaskId = null;
  }

  /**
   * Register shutdown cleanup via events.on('exit').
   */
  function registerCleanup(onStop) {
    events.on('exit', function () {
      try {
        if (currentTaskId && wsClient && wsClient.isOpen()) {
          wsClient.send({
            type: 'task_result',
            task_id: currentTaskId,
            status: 'stopped',
            stats: { reason: 'script_exit' },
          });
        }
      } catch (e) {}
      currentTaskId = null;
      if (typeof onStop === 'function') onStop();
    });
  }

  return {
    bindWs: bindWs,
    start: start,
    loadConfig: loadConfig,
    reportProgress: reportProgress,
    complete: complete,
    fail: fail,
    registerCleanup: registerCleanup,
    get currentTaskId() { return currentTaskId; },
  };
})();
