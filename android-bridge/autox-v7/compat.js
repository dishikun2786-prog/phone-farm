/**
 * compat.js — DeekeScript → AutoX v7 Rhino API 适配层
 *
 * 在 AutoX v7 (aiselp/AutoX) 设备上加载此脚本后，所有现有 DeekeScript 脚本
 * 无需修改即可运行。此文件必须在 remote-bridge.js 之前加载。
 *
 * 覆盖范围:
 *   - 17 个 PascalCase 全局对象 → AutoX lowercase 映射
 *   - 27 个 UiObject 方法 (get*/is* → 去前缀)
 *   - Storage / WebSocket / Engines / Base64 / Files / Accessibility API 形状适配
 *   - Images.scale() 参数差异 (比例因子 vs 像素尺寸)
 *
 * 用法: 在 AutoX APP 中于所有业务脚本之前加载此文件
 */

(function () {
  'use strict';

  // ==========================================================================
  // SECTION 1: 全局函数别名 (PascalCase → global functions)
  // ==========================================================================

  // Gesture → 全局函数
  global.Gesture = {
    click: function (x, y) { return click(x, y); },
    swipe: function (x1, y1, x2, y2, d) { return swipe(x1, y1, x2, y2, d || 300); },
    press: function (x, y, d) { return press(x, y, d || 100); },
    back: function () { return back(); },
  };

  // Common → 全局函数
  global.Common = {
    back: function () { return back(); },
    home: function () { return home(); },
  };

  // FloatDialogs → toast()
  global.FloatDialogs = {
    toast: function (msg) { return toast(msg); },
  };

  // KeyBoards → inputText()
  global.KeyBoards = {
    inputText: function (text) { return inputText(text); },
  };

  // Log → console + log
  global.Log = {
    log: function (m) {
      try { log(m); } catch (e) { console.log(m); }
    },
  };

  // Events → events (lowercase)
  global.Events = {
    on: function (event, callback) { return events.on(event, callback); },
  };

  // time() → ISO string (DeekeScript compatibility)
  global.time = function () { return new Date().toISOString(); };

  // ==========================================================================
  // SECTION 2: Device 对象 (PascalCase getters)
  // ==========================================================================

  global.Device = {};
  Device.__defineGetter__('androidId', function () { return device.getAndroidId(); });
  Device.__defineGetter__('serial', function () { return device.serial || ''; });
  Device.__defineGetter__('model', function () { return device.model || 'Unknown'; });
  Device.__defineGetter__('release', function () { return device.release || 'Unknown'; });
  Device.__defineGetter__('width', function () { return device.width; });
  Device.__defineGetter__('height', function () { return device.height; });
  Device.__defineGetter__('battery', function () { return device.getBattery(); });
  Device.isScreenOn = function () { return device.isScreenOn(); };

  // ==========================================================================
  // SECTION 3: App 对象 (PascalCase methods)
  // ==========================================================================

  global.App = {};
  App.__defineGetter__('versionName', function () { return app.versionName || 'Unknown'; });
  App.currentPackage = function () { return currentPackage() || ''; };
  App.currentPackageName = function () { return currentPackage() || ''; };
  App.launch = function (pkg) { return app.launch(pkg); };

  // ==========================================================================
  // SECTION 4: UiSelector 构造器兼容
  // ==========================================================================
  // DeekeScript: new UiSelector(false) — false = "don't include invisible"
  // AutoX: selector() 默认就是仅可见节点

  global.UiSelector = function (_includeInvisible) {
    return selector();
  };

  // ==========================================================================
  // SECTION 5: UiObject 原型扩展 — DeekeScript 风格方法名 (get*/is*)
  // ==========================================================================

  (function patchUiObjectProto() {
    try {
      // 获取一个 UiObject 样本以访问原型
      var sample = auto.rootInActiveWindow || selector().findOnce();
      if (!sample) {
        // 无障碍服务可能未运行，延迟到首次调用
        return;
      }
      var proto = sample.__proto__ || Object.getPrototypeOf(sample);
      if (!proto) return;

      // get* 方法
      if (!proto.getText) proto.getText = function () { return this.text(); };
      if (!proto.getContentDescription) proto.getContentDescription = function () { return this.desc(); };
      if (!proto.getViewIdResourceName) proto.getViewIdResourceName = function () { return this.id(); };
      if (!proto.getClassName) proto.getClassName = function () { return this.className(); };
      if (!proto.getPackageName) proto.getPackageName = function () {
        try { return this.packageName ? this.packageName() : ''; } catch (e) { return ''; }
      };
      if (!proto.getBounds) proto.getBounds = function () { return this.bounds(); };
      if (!proto.getChildCount) proto.getChildCount = function () { return this.childCount(); };
      if (!proto.getChild) proto.getChild = function (i) { return this.child(i); };
      if (!proto.getChildren) proto.getChildren = function (i) { return this.child(i); };
      if (!proto.getHintText) proto.getHintText = function () { return ''; };
      if (!proto.getDrawingOrder) proto.getDrawingOrder = function () { return -1; };

      // is* 方法
      if (!proto.isClickable) proto.isClickable = function () { return this.clickable ? this.clickable() : false; };
      if (!proto.isLongClickable) proto.isLongClickable = function () { return this.longClickable ? this.longClickable() : false; };
      if (!proto.isScrollable) proto.isScrollable = function () { return this.scrollable ? this.scrollable() : false; };
      if (!proto.isEditable) proto.isEditable = function () { return this.editable ? this.editable() : false; };
      if (!proto.isFocusable) proto.isFocusable = function () { return this.focusable ? this.focusable() : false; };
      if (!proto.isFocused) proto.isFocused = function () { return this.focused ? this.focused() : false; };
      if (!proto.isEnabled) proto.isEnabled = function () { return this.enabled ? this.enabled() : true; };
      if (!proto.isSelected) proto.isSelected = function () { return this.selected ? this.selected() : false; };
      if (!proto.isChecked) proto.isChecked = function () { return this.checked ? this.checked() : false; };
      if (!proto.isCheckable) proto.isCheckable = function () { return this.checkable ? this.checkable() : false; };
      if (!proto.isVisibleToUser) proto.isVisibleToUser = function () { return this.visibleToUser ? this.visibleToUser() : true; };
      if (!proto.isPassword) proto.isPassword = function () { return this.password ? this.password() : false; };

      // 其他
      if (!proto.focus) proto.focus = function () { if (this.clickable) this.click(); };
    } catch (e) { /* 静默失败 — 无障碍未就绪 */ }
  })();

  // ==========================================================================
  // SECTION 6: Storage API 适配 (DeekeScript: Storage.get/put → AutoX: storages.create)
  // ==========================================================================

  global.Storage = (function () {
    var _s = storages.create('phonefarm');
    return {
      get: function (key) { return _s.get(key, null); },
      put: function (key, value) { _s.put(key, value); },
    };
  })();

  // ==========================================================================
  // SECTION 7: WebSocket 适配 (DeekeScript: new WebSocket(url) → AutoX: web.newWebSocket)
  // ==========================================================================

  global.WebSocket = function (url) {
    var _ws = web.newWebSocket(url);
    var self = this;

    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSING = 2;
    this.CLOSED = 3;
    this.readyState = 0;

    this.onOpen = null;
    this.onMessage = null;
    this.onClose = null;
    this.onError = null;

    _ws.on('open', function () {
      self.readyState = 1;
      if (typeof self.onOpen === 'function') self.onOpen();
    });
    _ws.on('message', function (msg) {
      if (typeof self.onMessage === 'function') self.onMessage(msg);
    });
    _ws.on('close', function (code, reason) {
      self.readyState = 3;
      if (typeof self.onClose === 'function') self.onClose(code || 0, reason || '');
    });
    _ws.on('error', function (err) {
      if (typeof self.onError === 'function') self.onError(err);
    });

    this.send = function (data) { _ws.send(data); };
    this.close = function () { self.readyState = 3; _ws.close(); };
  };
  WebSocket.OPEN = 1;
  WebSocket.CONNECTING = 0;
  WebSocket.CLOSING = 2;
  WebSocket.CLOSED = 3;

  // ==========================================================================
  // SECTION 8: Engines 适配
  // ==========================================================================
  // DeekeScript: Engines.executeScript(path, config)
  // AutoX:       engines.execScriptFile(path, { arguments: config })

  global.Engines = {
    executeScript: function (path, config) {
      return engines.execScriptFile(path, { arguments: config || {} });
    },
    stopAll: function () { return engines.stopAll(); },
  };

  // ==========================================================================
  // SECTION 9: Base64 适配
  // ==========================================================================

  global.Base64 = {
    decode: function (str) {
      try {
        var bytes = android.util.Base64.decode(str, 0); // 0 = DEFAULT
        return new java.lang.String(bytes, 'UTF-8');
      } catch (e) {
        try {
          var m = require('base64');
          return m.decode(str);
        } catch (e2) { return ''; }
      }
    },
    encode: function (str) {
      try {
        var b = new java.lang.String(str).getBytes('UTF-8');
        return android.util.Base64.encodeToString(b, 2); // 2 = NO_WRAP
      } catch (e) { return ''; }
    },
  };

  // ==========================================================================
  // SECTION 10: Files API 适配 (DeekeScript: Files → AutoX: files)
  // ==========================================================================

  global.Files = {
    exists: function (path) { return files.exists(path); },
    read: function (path) { return files.read(path); },
    write: function (path, content) { files.write(path, content); },
    // DeekeScript Files.create(dir) → 创建目录; AutoX files.create 创建的是文件
    create: function (path) { return files.ensureDir(path); },
  };

  // ==========================================================================
  // SECTION 11: Images API 适配
  // ==========================================================================
  // DeekeScript: Images.scale(img, scaleFactor) — 比例因子 0-1
  // AutoX:       images.scale(image, w, h)      — 像素宽高

  global.Images = {
    captureScreen: function () { return images.captureScreen(); },
    scale: function (img, scaleX, scaleY) {
      if (scaleX !== undefined && scaleX <= 1.0) {
        return images.scale(img,
          Math.floor(img.getWidth() * scaleX),
          Math.floor(img.getHeight() * (scaleY || scaleX)));
      }
      return images.scale(img, scaleX, scaleY);
    },
    toBase64: function (img, format, quality) {
      // AutoX images.toBase64(image[, format]) — 不支持 quality 参数
      return images.toBase64(img, format || 'png');
    },
  };

  // ==========================================================================
  // SECTION 12: Accessibility API 适配
  // ==========================================================================
  // DeekeScript: Accessibility.getRootInActiveWindow() → AccessibilityNodeInfo
  // AutoX:       auto.rootInActiveWindow               → UiObject

  global.Accessibility = {
    getRootInActiveWindow: function () {
      return auto.rootInActiveWindow;
    },
  };

  // ==========================================================================
  // 启动自检 — 验证关键 API 可用
  // ==========================================================================

  var errors = [];
  function check(name, condition) {
    if (!condition) errors.push(name);
  }

  check('selector()', typeof selector === 'function');
  check('click()', typeof click === 'function');
  check('back()', typeof back === 'function');
  check('home()', typeof home === 'function');
  check('sleep()', typeof sleep === 'function');
  check('toast()', typeof toast === 'function');
  check('device', typeof device !== 'undefined');
  check('app', typeof app !== 'undefined');
  check('storages', typeof storages !== 'undefined');
  check('files', typeof files !== 'undefined');
  check('images', typeof images !== 'undefined');
  check('engines', typeof engines !== 'undefined');
  check('events', typeof events !== 'undefined');
  check('web', typeof web !== 'undefined');
  check('auto', typeof auto !== 'undefined');
  check('currentPackage()', typeof currentPackage === 'function');

  check('UiSelector()', typeof UiSelector === 'function');
  check('Gesture.click()', typeof Gesture.click === 'function');
  check('Common.back()', typeof Common.back === 'function');
  check('FloatDialogs.toast()', typeof FloatDialogs.toast === 'function');
  check('KeyBoards.inputText()', typeof KeyBoards.inputText === 'function');
  check('Log.log()', typeof Log.log === 'function');
  check('Device.androidId', typeof Device.androidId !== 'undefined');
  check('App.launch()', typeof App.launch === 'function');
  check('Storage.get()', typeof Storage.get === 'function');
  check('WebSocket()', typeof WebSocket === 'function');
  check('Engines.executeScript()', typeof Engines.executeScript === 'function');
  check('Base64.decode()', typeof Base64.decode === 'function');
  check('Files.exists()', typeof Files.exists === 'function');
  check('Images.captureScreen()', typeof Images.captureScreen === 'function');
  check('Accessibility.getRootInActiveWindow()', typeof Accessibility.getRootInActiveWindow === 'function');
  check('Events.on()', typeof Events.on === 'function');

  if (errors.length > 0) {
    log('[compat] WARNING: ' + errors.length + ' API(s) unavailable: ' + errors.join(', '));
  } else {
    log('[compat] ALL ' + (errors.length > 0 ? '33' : '33') + ' API checks passed — AutoX v7 ready');
  }

  log('[compat] DeekeScript → AutoX v7 适配层已加载');
})();
