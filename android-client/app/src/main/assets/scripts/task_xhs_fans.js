/**
 * task_xhs_fans.js — 小红书涨粉 (AutoX v7 原生版)
 *
 * 通过高频点赞+关注实现涨粉，侧重互动率。
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

config.maxScroll   = config.maxScroll   || 60;
config.viewSeconds = config.viewSeconds || 8;
config.likeRate    = config.likeRate    || 85;
config.followRate  = config.followRate  || 60;
config.commentRate = config.commentRate || 25;
config.comments    = config.comments    || ['关注了', '互关呀', '好看', '支持', '很棒'];

function main() {
  log('[task_xhs_fans] 小红书涨粉任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Xiaohongshu = AppAutomation.Xiaohongshu;
  if (!Xiaohongshu.open()) { log('[ERROR] 无法打开小红书'); return; }

  var stats = AppAutomation.runFeedMarketing(Xiaohongshu, config);
  AppAutomation.reportComplete(stats);
  log('[task_xhs_fans] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_xhs_fans] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
