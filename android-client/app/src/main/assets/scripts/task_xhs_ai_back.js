/**
 * task_xhs_ai_back.js — 小红书AI自动回复 (AutoX v7 原生版)
 *
 * 监控评论和私信通知，使用预定义话术自动回复。
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

config.durationMinutes = config.durationMinutes || 30;
config.checkInterval   = config.checkInterval   || 20;
config.replyTemplates  = config.replyTemplates  || ['谢谢支持', '感谢关注', '好的', '收到', '嗯嗯', '一起加油', '棒棒哒'];
config.autoFollowBack  = config.autoFollowBack  !== false;

function main() {
  log('[task_xhs_ai_back] 小红书AI自动回复任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Xiaohongshu = AppAutomation.Xiaohongshu;
  if (!Xiaohongshu.open()) { log('[ERROR] 无法打开小红书'); return; }

  var stats = { replies: 0, followBacks: 0, checks: 0, errors: 0, startTime: new Date().toISOString() };
  var endTime = Date.now() + config.durationMinutes * 60 * 1000;

  while (Date.now() < endTime) {
    try {
      stats.checks++;

      // 点击消息/通知Tab
      var msgTab = selector().text('消息').clickable(true).findOnce();
      if (!msgTab) msgTab = selector().descContains('消息').clickable(true).findOnce();
      if (!msgTab) msgTab = selector().text('通知').clickable(true).findOnce();

      if (msgTab) {
        msgTab.click();
        sleep(1500);

        // 查找未读消息并回复
        var unreadItems = selector().clickable(true).find();
        var repliedThisRound = 0;

        for (var i = 0; i < Math.min(unreadItems.length, 3); i++) {
          try {
            unreadItems[i].click();
            sleep(800);

            var input = selector().editable(true).className('android.widget.EditText').findOnce();
            if (input) {
              var reply = config.replyTemplates[Math.floor(Math.random() * config.replyTemplates.length)];
              input.focus();
              sleep(200);
              input.setText(reply);
              sleep(300);
              var send = selector().text('发送').clickable(true).findOnce();
              if (send) { send.click(); stats.replies++; repliedThisRound++; }
            }

            // 自动回关
            if (config.autoFollowBack) {
              var followBtn = selector().text('关注').clickable(true).findOnce();
              if (followBtn) { followBtn.click(); stats.followBacks++; }
            }

            back();
            sleep(500);
          } catch (e) {}
        }
      }

      AppAutomation.reportProgress(stats, stats.checks, 0);
      sleep(config.checkInterval * 1000);

    } catch (e) {
      stats.errors++;
      log('[task_xhs_ai_back] 出错: ' + e.message);
      sleep(3000);
    }
  }

  stats.endTime = new Date().toISOString();
  AppAutomation.reportComplete(stats);
  log('[task_xhs_ai_back] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_xhs_ai_back] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
