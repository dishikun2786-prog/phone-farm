/**
 * task_xhs_toker.js — 小红书推荐营销 (AutoX v7 原生版)
 *
 * 刷推荐笔记，根据概率点赞/收藏/评论/关注。
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
config.likeRate    = config.likeRate    || 65;
config.commentRate = config.commentRate || 35;
config.followRate  = config.followRate  || 15;
config.comments    = config.comments    || ['学到了', '收藏了', '太棒了', '谢谢分享', '好内容', '已关注'];

function main() {
  log('[task_xhs_toker] 小红书推荐营销任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Xiaohongshu = AppAutomation.Xiaohongshu;
  if (!Xiaohongshu.open()) { log('[ERROR] 无法打开小红书'); return; }

  var stats = AppAutomation.runFeedMarketing(Xiaohongshu, config);
  AppAutomation.reportComplete(stats);
  log('[task_xhs_toker] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_xhs_toker] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
