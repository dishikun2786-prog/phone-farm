/**
 * task_dy_toker.js — 抖音推荐营销 (AutoX v7 原生版)
 *
 * 刷推荐视频，根据概率点赞/评论/关注/私信。
 * 由 remote-bridge.js 通过 engines.execScriptFile() 启动。
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

config.maxScroll   = config.maxScroll   || config.toker_view_video_num   || 50;
config.viewSeconds = config.viewSeconds || config.toker_view_video_second || 30;
config.likeRate    = config.likeRate    || config.toker_zan_rate          || 70;
config.commentRate = config.commentRate || config.toker_comment_rate      || 60;
config.followRate  = config.followRate  || config.toker_focus_rate        || 20;
config.pmRate      = config.pmRate      || config.toker_private_msg_rate  || 10;
config.comments    = config.comments    || ['太棒了', '学会了', '受益匪浅', '感谢分享', '牛啊', '厉害', '高手', '怎么做到的', '学习了', '666', '精彩', '赞一个', '干货', '收藏了', '转发了', '有道理', '不错不错', '支持', '加油', '好内容'];
config.pmMessages  = config.pmMessages  || ['你好，看了你的视频很有收获', '大佬能交流一下吗', '互关一下呗'];

function main() {
  log('============================================');
  log('[task_dy_toker] 抖音推荐营销任务启动');
  log('[task_dy_toker] Task ID: ' + taskId);
  log('[task_dy_toker] 配置: maxScroll=' + config.maxScroll + ' view=' + config.viewSeconds + 's like=' + config.likeRate + '% comment=' + config.commentRate + '% follow=' + config.followRate + '% pm=' + config.pmRate + '%');
  log('============================================');

  if (typeof AppAutomation === 'undefined') {
    log('[ERROR] AppAutomation 未加载');
    return;
  }

  var Douyin = AppAutomation.Douyin;
  if (!Douyin.open()) { log('[ERROR] 无法打开抖音'); return; }

  var stats = AppAutomation.runFeedMarketing(Douyin, config);
  AppAutomation.reportComplete(stats);
  log('[task_dy_toker] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try {
  var result = main();
  global._taskResult = result;
} catch (e) {
  log('[task_dy_toker] 任务异常: ' + e.message);
  try {
    if (typeof remoteBridge !== 'undefined' && remoteBridge.sendTaskResult) {
      remoteBridge.sendTaskResult('failed', { error: e.message });
    }
  } catch (_) {}
}
