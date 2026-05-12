/**
 * task_wx_toker.js — 微信视频号推荐营销 (AutoX v7 原生版)
 *
 * 进入微信→发现→视频号，刷推荐视频互动。
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

config.maxScroll   = config.maxScroll   || 40;
config.viewSeconds = config.viewSeconds || 20;
config.likeRate    = config.likeRate    || 50;
config.commentRate = config.commentRate || 30;
config.followRate  = config.followRate  || 10;
config.comments    = config.comments    || ['不错', '支持', '有道理', '关注了'];

function main() {
  log('[task_wx_toker] 微信视频号推荐营销任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Wechat = AppAutomation.Wechat;
  if (!Wechat.open()) { log('[ERROR] 无法打开微信'); return; }

  // 进入视频号
  if (!Wechat.enterVideoChannel()) {
    log('[ERROR] 无法进入视频号');
    return;
  }

  var stats = AppAutomation.runFeedMarketing(Wechat, config);
  AppAutomation.reportComplete(stats);
  log('[task_wx_toker] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_wx_toker] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
