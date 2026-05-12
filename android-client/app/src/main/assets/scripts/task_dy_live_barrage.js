/**
 * task_dy_live_barrage.js — 抖音直播间弹幕 (AutoX v7 原生版)
 *
 * 进入直播间，定时发送弹幕互动。
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

config.durationMinutes = config.durationMinutes || 15;
config.barrageInterval = config.barrageInterval || 30; // 弹幕间隔秒数
config.barrages = config.barrages || ['666', '主播好棒', '来了', '支持', '加油', '哈哈哈', '好听', '牛啊', '精彩'];

function main() {
  log('[task_dy_live_barrage] 抖音直播间弹幕任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Douyin = AppAutomation.Douyin;
  if (!Douyin.open()) { log('[ERROR] 无法打开抖音'); return; }
  sleep(2000);

  // 进入直播间
  var liveRoom = selector().descContains('直播').clickable(true).findOnce();
  if (!liveRoom) {
    log('[task_dy_live_barrage] 未找到直播间入口');
    return;
  }
  liveRoom.click();
  sleep(3000);

  var stats = { barrages: 0, errors: 0, startTime: new Date().toISOString() };
  var endTime = Date.now() + config.durationMinutes * 60 * 1000;

  while (Date.now() < endTime) {
    try {
      var text = config.barrages[Math.floor(Math.random() * config.barrages.length)];
      if (Douyin.sendBarrage(text)) {
        stats.barrages++;
      }
      AppAutomation.reportProgress(stats, stats.barrages, 0);
      sleep(config.barrageInterval * 1000);
    } catch (e) {
      stats.errors++;
      log('[task_dy_live_barrage] 出错: ' + e.message);
      sleep(2000);
    }
  }

  stats.endTime = new Date().toISOString();
  AppAutomation.reportComplete(stats);
  log('[task_dy_live_barrage] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_dy_live_barrage] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
