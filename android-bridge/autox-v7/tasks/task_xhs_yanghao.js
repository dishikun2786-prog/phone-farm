/**
 * task_xhs_yanghao.js — 小红书养号 (AutoX v7 原生版)
 *
 * 模拟真人浏览行为：慢速刷笔记、随机互动、定时休息。
 * 目的是提高账号权重，避免被平台判定为机器人。
 */

var taskId = global._taskId || '';
var config = global._config || {};
if (!config || Object.keys(config).length === 0) {
  try {
    var s = storages.create('phonefarm_tasks');
    var stored = s.get('config_' + taskId, null);
    if (stored) config = JSON.parse(stored);
  } catch (e) {}
}

config.durationMinutes = config.durationMinutes || 30;
config.scrollInterval  = config.scrollInterval  || 15;

function main() {
  log('[task_xhs_yanghao] 小红书养号任务启动, 时长: ' + config.durationMinutes + ' 分钟');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Xiaohongshu = AppAutomation.Xiaohongshu;
  if (!Xiaohongshu.open()) { log('[ERROR] 无法打开小红书'); return; }

  var stats = AppAutomation.runYanghao(Xiaohongshu, config);
  AppAutomation.reportComplete(stats);
  log('[task_xhs_yanghao] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_xhs_yanghao] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
