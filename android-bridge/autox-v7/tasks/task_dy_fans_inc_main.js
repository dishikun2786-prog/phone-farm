/**
 * task_dy_fans_inc_main.js — 抖音涨粉 (AutoX v7 原生版)
 *
 * 通过批量点赞+关注实现涨粉。
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

config.maxScroll   = config.maxScroll   || 80;
config.viewSeconds = config.viewSeconds || 5;
config.likeRate    = config.likeRate    || 90;
config.followRate  = config.followRate  || 70;
config.commentRate = config.commentRate || 5;
config.pmRate      = config.pmRate      || 0;

function main() {
  log('[task_dy_fans_inc_main] 抖音涨粉任务启动');
  log('[task_dy_fans_inc_main] 配置: maxScroll=' + config.maxScroll + ' likeRate=' + config.likeRate + '% followRate=' + config.followRate + '%');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Douyin = AppAutomation.Douyin;
  if (!Douyin.open()) { log('[ERROR] 无法打开抖音'); return; }

  var stats = AppAutomation.runFeedMarketing(Douyin, config);
  AppAutomation.reportComplete(stats);
  log('[task_dy_fans_inc_main] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_dy_fans_inc_main] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
