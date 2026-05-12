/**
 * task_wx_search_inquiry.js — 微信视频号搜索询盘 (AutoX v7 原生版)
 *
 * 在微信视频号中搜索关键词，对目标用户互动获取询盘。
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

config.keywords    = config.keywords    || ['货源', '批发', '工厂'];
config.maxUsers    = config.maxUsers    || 10;
config.followRate  = config.followRate  || 50;
config.likeRate    = config.likeRate    || 70;
config.commentRate = config.commentRate || 30;
config.comments    = config.comments    || ['怎么联系', '价格多少', '在哪里', '私信你了'];
config.pmRate      = config.pmRate      || 40;
config.pmMessages  = config.pmMessages  || ['你好，想了解一下产品', '方便留个联系方式吗', '怎么合作'];

function main() {
  log('[task_wx_search_inquiry] 微信视频号搜索询盘任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Wechat = AppAutomation.Wechat;
  if (!Wechat.open()) { log('[ERROR] 无法打开微信'); return; }
  if (!Wechat.enterVideoChannel()) { log('[ERROR] 无法进入视频号'); return; }

  var stats = AppAutomation.runSearchMarketing(Wechat, config);
  AppAutomation.reportComplete(stats);
  log('[task_wx_search_inquiry] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_wx_search_inquiry] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
