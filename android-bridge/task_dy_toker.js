/**
 * task_dy_toker.js — 抖音推荐营销任务脚本
 *
 * 这是一个可直接在 DeekeScript 中运行的完整任务脚本。
 * 依赖: app-automation.js, node-inspector.js
 *
 * 运行方式:
 *   1. 在 DeekeScript 中加载 app-automation.js
 *   2. 加载本脚本即可独立运行
 *   3. 或由 remote-bridge.js 通过 Engines.executeScript 启动
 *
 * 配置参数来源:
 *   1. 由 control-server 下发的 config 对象
 *   2. 或从 Storage 读取 remote_task_config_{taskId}
 *   3. 或使用本脚本默认值
 */

// 获取任务配置
var taskId = global._taskId || Storage.get('current_task_id') || 'local';
var config = global._config || {};

// 如果由 remote-bridge 启动，尝试从 Storage 读取配置
if (!config || Object.keys(config).length === 0) {
  try {
    var stored = Storage.get('remote_task_config_' + taskId);
    if (stored) config = JSON.parse(stored);
  } catch (e) {}
}

// 默认配置
config.maxScroll          = config.maxScroll          || config.toker_view_video_num   || 50;
config.viewSeconds        = config.viewSeconds        || config.toker_view_video_second || 30;
config.likeRate           = config.likeRate           || config.toker_zan_rate          || 70;
config.commentRate        = config.commentRate        || config.toker_comment_rate      || 60;
config.followRate         = config.followRate         || config.toker_focus_rate        || 20;
config.pmRate             = config.pmRate             || config.toker_private_msg_rate  || 10;
config.commentAreaZanRate = config.commentAreaZanRate || config.toker_comment_area_zan_rate || 80;
config.keywords           = config.keywords           || [];
config.comments           = config.comments           || [
  '太棒了', '学会了', '受益匪浅', '感谢分享',
  '牛啊', '厉害', '高手', '怎么做到的',
  '学习了', '666', '精彩', '赞一个',
  '干货', '收藏了', '转发了', '有道理',
  '不错不错', '支持', '加油', '好内容',
];
config.pmMessages = config.pmMessages || [
  '你好，看了你的视频很有收获',
  '大佬能交流一下吗',
  '互关一下呗',
];

// ==========================================================================
// 主流程
// ==========================================================================
function main() {
  Log.log('============================================');
  Log.log('[task_dy_toker] 抖音推荐营销任务启动');
  Log.log('[task_dy_toker] Task ID: ' + taskId);
  Log.log('[task_dy_toker] 配置: maxScroll=' + config.maxScroll +
    ' view=' + config.viewSeconds + 's' +
    ' like=' + config.likeRate + '%' +
    ' comment=' + config.commentRate + '%' +
    ' follow=' + config.followRate + '%' +
    ' pm=' + config.pmRate + '%');
  Log.log('============================================');

  // 检查 AppAutomation 是否已加载
  if (typeof AppAutomation === 'undefined') {
    Log.log('[ERROR] AppAutomation 未加载，请先运行 app-automation.js');
    return;
  }

  var Douyin = AppAutomation.Douyin;

  // 打开抖音
  Log.log('[task_dy_toker] 正在打开抖音...');
  if (!Douyin.open()) {
    Log.log('[ERROR] 无法打开抖音');
    return;
  }

  // 执行推荐流营销
  var stats = AppAutomation.runFeedMarketing(Douyin, config);

  // 上报结果
  AppAutomation.reportComplete(stats);

  Log.log('[task_dy_toker] 任务完成: ' + JSON.stringify(stats));
  return stats;
}

// 执行
try {
  var result = main();
  global._taskResult = result;
} catch (e) {
  Log.log('[task_dy_toker] 任务异常: ' + e.message);
  try {
    if (typeof remoteBridge !== 'undefined' && remoteBridge.sendTaskResult) {
      remoteBridge.sendTaskResult('failed', { error: e.message });
    }
  } catch (_) {}
}
