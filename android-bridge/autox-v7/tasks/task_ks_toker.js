/**
 * task_ks_toker.js — 快手推荐营销 (AutoX v7 原生版)
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

config.maxScroll   = config.maxScroll   || 50;
config.viewSeconds = config.viewSeconds || 25;
config.likeRate    = config.likeRate    || 60;
config.commentRate = config.commentRate || 40;
config.followRate  = config.followRate  || 15;
config.comments    = config.comments    || ['不错', '支持', '666', '厉害了', '学到了'];

function main() {
  log('[task_ks_toker] 快手推荐营销任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Kuaishou = AppAutomation.Kuaishou;
  if (!Kuaishou.open()) { log('[ERROR] 无法打开快手'); return; }

  var stats = AppAutomation.runFeedMarketing(Kuaishou, config);
  AppAutomation.reportComplete(stats);
  log('[task_ks_toker] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_ks_toker] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
