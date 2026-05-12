/**
 * task_dy_search_user.js — 抖音搜索用户营销 (AutoX v7 原生版)
 *
 * 搜索关键词，对搜索结果中的用户进行关注/点赞/评论互动。
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

config.keywords    = config.keywords    || ['健身', '美食', '旅游'];
config.maxUsers    = config.maxUsers    || 15;
config.followRate  = config.followRate  || 40;
config.likeRate    = config.likeRate    || 60;
config.commentRate = config.commentRate || 25;
config.comments    = config.comments    || ['不错', '关注了', '互关', '支持一下'];

function main() {
  log('[task_dy_search_user] 抖音搜索用户营销任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Douyin = AppAutomation.Douyin;
  if (!Douyin.open()) { log('[ERROR] 无法打开抖音'); return; }

  var stats = AppAutomation.runSearchMarketing(Douyin, config);
  AppAutomation.reportComplete(stats);
  log('[task_dy_search_user] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_dy_search_user] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
