/**
 * compat-test.js — AutoX v7 适配层自检脚本
 *
 * 在 AutoX APP 中加载 compat.js 后运行此脚本，验证所有 API 映射是否正确。
 * 输出每个 API 的 pass/fail 状态到 Log。
 *
 * 使用: 在 AutoX APP 中依次加载 compat.js → compat-test.js
 */

(function () {
  'use strict';

  var results = { passed: 0, failed: 0, skipped: 0, details: [] };

  function test(name, fn) {
    try {
      var ok = fn();
      if (ok) {
        results.passed++;
        results.details.push('[PASS] ' + name);
      } else {
        results.failed++;
        results.details.push('[FAIL] ' + name + ' — returned false');
      }
    } catch (e) {
      results.failed++;
      results.details.push('[FAIL] ' + name + ' — ' + e.message);
    }
  }

  // ==========================================================================
  // 1. 全局函数
  // ==========================================================================
  test('Gesture.click() 存在且可调用', function () { return typeof Gesture.click === 'function'; });
  test('Gesture.swipe() 存在且可调用', function () { return typeof Gesture.swipe === 'function'; });
  test('Gesture.press() 存在且可调用', function () { return typeof Gesture.press === 'function'; });
  test('Gesture.back() 存在且可调用', function () { return typeof Gesture.back === 'function'; });
  test('Common.back() 存在且可调用', function () { return typeof Common.back === 'function'; });
  test('Common.home() 存在且可调用', function () { return typeof Common.home === 'function'; });
  test('FloatDialogs.toast() 存在且可调用', function () { return typeof FloatDialogs.toast === 'function'; });
  test('KeyBoards.inputText() 存在且可调用', function () { return typeof KeyBoards.inputText === 'function'; });
  test('Log.log() 存在且可调用', function () { return typeof Log.log === 'function'; });
  test('Events.on() 存在且可调用', function () { return typeof Events.on === 'function'; });

  // ==========================================================================
  // 2. Device 对象
  // ==========================================================================
  test('Device.androidId 可访问 (getter)', function () {
    var id = Device.androidId;
    return typeof id === 'string' && id.length > 0;
  });
  test('Device.model 可访问 (getter)', function () {
    return typeof Device.model === 'string';
  });
  test('Device.release 可访问 (getter)', function () {
    return typeof Device.release === 'string';
  });
  test('Device.width 可访问 (getter)', function () {
    return typeof Device.width === 'number' && Device.width > 0;
  });
  test('Device.height 可访问 (getter)', function () {
    return typeof Device.height === 'number' && Device.height > 0;
  });
  test('Device.battery 可访问 (getter)', function () {
    var b = Device.battery;
    return typeof b === 'number' && b >= 0 && b <= 100;
  });
  test('Device.isScreenOn() 可调用', function () {
    return typeof Device.isScreenOn === 'function';
  });

  // ==========================================================================
  // 3. App 对象
  // ==========================================================================
  test('App.versionName 可访问 (getter)', function () {
    return typeof App.versionName === 'string';
  });
  test('App.currentPackage() 返回字符串', function () {
    return typeof App.currentPackage() === 'string';
  });
  test('App.currentPackageName() 返回字符串', function () {
    return typeof App.currentPackageName() === 'string';
  });
  test('App.launch() 存在且可调用', function () {
    return typeof App.launch === 'function';
  });

  // ==========================================================================
  // 4. UiSelector
  // ==========================================================================
  test('UiSelector() 返回 selector 对象', function () {
    var s = UiSelector();
    return s !== null && s !== undefined;
  });
  test('UiSelector().text() 可链式调用', function () {
    return typeof UiSelector().text === 'function';
  });
  test('UiSelector().desc() 可链式调用', function () {
    return typeof UiSelector().desc === 'function';
  });
  test('UiSelector().id() 可链式调用', function () {
    return typeof UiSelector().id === 'function';
  });
  test('UiSelector().className() 可链式调用', function () {
    return typeof UiSelector().className === 'function';
  });
  test('UiSelector().clickable() 可链式调用', function () {
    return typeof UiSelector().clickable === 'function';
  });
  test('UiSelector().findOnce() 可调用', function () {
    return typeof UiSelector().findOnce === 'function';
  });

  // ==========================================================================
  // 5. Storage API
  // ==========================================================================
  test('Storage.put() 存储值', function () {
    Storage.put('_compat_test', 'hello');
    return true;
  });
  test('Storage.get() 读取值', function () {
    var v = Storage.get('_compat_test');
    return v === 'hello';
  });

  // ==========================================================================
  // 6. Files API
  // ==========================================================================
  test('Files.exists() 检测文件', function () {
    return typeof Files.exists('/sdcard/') === 'boolean';
  });
  test('Files.write() 写入文件', function () {
    Files.write('/sdcard/_compat_test.txt', 'compat-test');
    return Files.exists('/sdcard/_compat_test.txt');
  });
  test('Files.read() 读取文件', function () {
    var content = Files.read('/sdcard/_compat_test.txt');
    return content === 'compat-test';
  });

  // ==========================================================================
  // 7. Images API
  // ==========================================================================
  test('Images.captureScreen() 截图', function () {
    var img = Images.captureScreen();
    var ok = img !== null && img !== undefined;
    if (img) img.recycle();
    return ok;
  });

  // ==========================================================================
  // 8. Base64 API
  // ==========================================================================
  test('Base64.encode() 编码', function () {
    var enc = Base64.encode('hello autoX');
    return typeof enc === 'string' && enc.length > 0;
  });
  test('Base64.decode() 解码', function () {
    var enc = Base64.encode('hello autoX');
    var dec = Base64.decode(enc);
    return dec === 'hello autoX';
  });

  // ==========================================================================
  // 9. WebSocket (不实际连接，只验证构造函数)
  // ==========================================================================
  test('WebSocket 构造器可用', function () {
    return typeof WebSocket === 'function';
  });
  test('WebSocket.OPEN 常量', function () {
    return WebSocket.OPEN === 1;
  });

  // ==========================================================================
  // 10. Engines
  // ==========================================================================
  test('Engines.executeScript() 存在', function () {
    return typeof Engines.executeScript === 'function';
  });
  test('Engines.stopAll() 存在', function () {
    return typeof Engines.stopAll === 'function';
  });

  // ==========================================================================
  // 11. Accessibility
  // ==========================================================================
  test('Accessibility.getRootInActiveWindow() 存在', function () {
    return typeof Accessibility.getRootInActiveWindow === 'function';
  });

  // ==========================================================================
  // 12. UiObject 方法扩展 (无障碍运行时)
  // ==========================================================================
  test('UiObject.getText() 扩展', function () {
    var node = UiSelector().findOnce();
    if (!node) { results.skipped++; results.details.push('[SKIP] getText — no node on screen'); return true; }
    var ok = typeof node.getText === 'function';
    return ok;
  });
  test('UiObject.getContentDescription() 扩展', function () {
    var node = UiSelector().findOnce();
    if (!node) { results.skipped++; results.details.push('[SKIP] getContentDescription'); return true; }
    return typeof node.getContentDescription === 'function';
  });
  test('UiObject.getViewIdResourceName() 扩展', function () {
    var node = UiSelector().findOnce();
    if (!node) { results.skipped++; results.details.push('[SKIP] getViewIdResourceName'); return true; }
    return typeof node.getViewIdResourceName === 'function';
  });
  test('UiObject.getChildCount() 扩展', function () {
    var node = UiSelector().findOnce();
    if (!node) { results.skipped++; results.details.push('[SKIP] getChildCount'); return true; }
    return typeof node.getChildCount === 'function';
  });
  test('UiObject.isClickable() 扩展', function () {
    var node = UiSelector().findOnce();
    if (!node) { results.skipped++; results.details.push('[SKIP] isClickable'); return true; }
    return typeof node.isClickable === 'function';
  });

  // ==========================================================================
  // 13. DeekeScript 全局别名
  // ==========================================================================
  test('global.Device === Device', function () { return global.Device === Device; });
  test('global.App === App', function () { return global.App === App; });
  test('global.Files === Files', function () { return global.Files === Files; });
  test('global.Storage === Storage', function () { return global.Storage === Storage; });
  test('global.WebSocket === WebSocket', function () { return global.WebSocket === WebSocket; });

  // ==========================================================================
  // 输出报告
  // ==========================================================================
  log('============================================');
  log('[compat-test] AutoX v7 兼容性自检报告');
  log('[compat-test] PASS:  ' + results.passed);
  log('[compat-test] FAIL:  ' + results.failed);
  log('[compat-test] SKIP:  ' + results.skipped);
  log('[compat-test] TOTAL: ' + (results.passed + results.failed + results.skipped));
  log('--------------------------------------------');

  for (var i = 0; i < results.details.length; i++) {
    log(results.details[i]);
  }

  log('============================================');

  if (results.failed === 0) {
    toast('[compat-test] ALL PASSED — AutoX v7 适配就绪');
  } else {
    toast('[compat-test] ' + results.failed + ' FAILED — 请检查 Log');
  }

  // 存入 Storage 供控制服务器查询
  Storage.put('_compat_test_result', JSON.stringify({
    passed: results.passed,
    failed: results.failed,
    skipped: results.skipped,
    timestamp: new Date().toISOString(),
    details: results.details,
  }));
})();
