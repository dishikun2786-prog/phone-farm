/**
 * task_ks_search_user.js — 快手搜索用户营销 (AutoX v7 原生版)
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

config.keywords    = config.keywords    || ['搞笑', '美食', '农村生活'];
config.maxUsers    = config.maxUsers    || 15;
config.followRate  = config.followRate  || 35;
config.likeRate    = config.likeRate    || 55;
config.commentRate = config.commentRate || 20;
config.comments    = config.comments    || ['支持', '关注了', '加油'];

function main() {
  log('[task_ks_search_user] 快手搜索用户营销任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Kuaishou = AppAutomation.Kuaishou;
  if (!Kuaishou.open()) { log('[ERROR] 无法打开快手'); return; }

  var stats = AppAutomation.runSearchMarketing(Kuaishou, config);
  AppAutomation.reportComplete(stats);
  log('[task_ks_search_user] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_ks_search_user] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
