/**
 * task_dy_toker_city.js — 抖音同城营销 (AutoX v7 原生版)
 *
 * 切换到同城Tab，刷同城视频，根据概率互动。
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
config.likeRate    = config.likeRate    || 60;
config.commentRate = config.commentRate || 40;
config.followRate  = config.followRate  || 15;
config.pmRate      = config.pmRate      || 8;
config.comments    = config.comments    || ['同城的朋友好', '支持本地创作者', '不错', '加油'];
config.pmMessages  = config.pmMessages  || ['你好，同城的', '交流一下'];

function main() {
  log('[task_dy_toker_city] 抖音同城营销任务启动');

  if (typeof AppAutomation === 'undefined') { log('[ERROR] AppAutomation 未加载'); return; }

  var Douyin = AppAutomation.Douyin;
  if (!Douyin.open()) { log('[ERROR] 无法打开抖音'); return; }

  // 点击同城Tab
  sleep(2000);
  try {
    var cityTab = selector().textContains('同城').clickable(true).findOnce();
    if (cityTab) cityTab.click();
    sleep(2000);
  } catch (e) {
    log('[task_dy_toker_city] 无法进入同城Tab: ' + e.message);
  }

  var stats = AppAutomation.runFeedMarketing(Douyin, config);
  AppAutomation.reportComplete(stats);
  log('[task_dy_toker_city] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

try { global._taskResult = main(); } catch (e) {
  log('[task_dy_toker_city] 任务异常: ' + e.message);
  try { if (typeof remoteBridge !== 'undefined') remoteBridge.sendTaskResult('failed', { error: e.message }); } catch (_) {}
}
