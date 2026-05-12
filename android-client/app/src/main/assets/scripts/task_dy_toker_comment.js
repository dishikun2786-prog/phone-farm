/**
 * task_dy_toker_comment.js — 抖音评论区互动 (AutoX v7 原生版)
 *
 * 在推荐视频的评论区点赞评论，模拟社区互动。
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

config.maxScroll     = config.maxScroll     || 30;
config.viewSeconds   = config.viewSeconds   || 10;
config.commentRate   = config.commentRate   || 80;
config.commentAreaZanRate = config.commentAreaZanRate || 70;
config.comments      = config.comments      || ['说得对', '有道理', '赞同', '666', '同感', '确实', '哈哈哈', '牛'];
config.likeRate      = config.likeRate      || 40;

function main() {
  log('[task_dy_toker_comment] 抖音评论区互动任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Douyin = AppAutomation.Douyin;
  if (!Douyin.open()) { log('[ERROR] 无法打开抖音'); return; }

  var stats = { views: 0, comments: 0, commentLikes: 0, likes: 0 };

  for (var i = 0; i < config.maxScroll; i++) {
    try {
      stats.views++;
      sleep(config.viewSeconds * 1000);

      // 打开评论区
      var commentBtn = selector().descContains('评论').clickable(true).findOnce();
      if (commentBtn) {
        commentBtn.click();
        sleep(800);

        // 在评论区点赞几个评论
        var commentNodes = selector().descContains('赞').clickable(true).find();
        var likeCount = Math.min(commentNodes.length, 3);
        for (var j = 0; j < likeCount; j++) {
          try { commentNodes[j].click(); stats.commentLikes++; sleep(300); } catch (e) {}
        }

        // 发评论
        if (Math.random() * 100 < config.commentRate) {
          var text = config.comments[Math.floor(Math.random() * config.comments.length)];
          var input = selector().editable(true).className('android.widget.EditText').findOnce();
          if (input) {
            input.focus();
            sleep(200);
            input.setText(text);
            sleep(300);
            var send = selector().text('发送').clickable(true).findOnce();
            if (send) { send.click(); stats.comments++; }
          }
        }

        back();
        sleep(300);
      }

      if (Math.random() * 100 < config.likeRate) {
        if (Douyin.like()) stats.likes++;
      }

      if (i < config.maxScroll - 1) { Douyin.nextVideo(); }

      AppAutomation.reportProgress(stats, i + 1, config.maxScroll);
    } catch (e) {
      log('[task_dy_toker_comment] 出错: ' + e.message);
      if (i < config.maxScroll - 1) { Douyin.nextVideo(); }
    }
  }

  AppAutomation.reportComplete(stats);
  log('[task_dy_toker_comment] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_dy_toker_comment] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
