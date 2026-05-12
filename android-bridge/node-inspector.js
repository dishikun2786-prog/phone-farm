/**
 * node-inspector.js — DeekeScript 通用节点信息获取器
 *
 * 功能:
 * 1. 获取当前屏幕完整的无障碍节点树
 * 2. 按 APP 自动分类，导出结构化节点信息
 * 3. 支持简单模式/复杂模式切换
 * 4. 输出到 Log + Storage，供开发脚本时参考
 *
 * 使用方式: 在 DeekeScript APP 中运行此脚本
 *   - 单次截图: nodeInspector.dumpCurrentScreen()
 *   - 监听模式: nodeInspector.watchApp()
 */

// ==========================================================================
// 节点信息获取核心
// ==========================================================================

var nodeInspector = (function () {
  'use strict';

  /**
   * 获取当前前台 APP 包名
   */
  function getCurrentPackage() {
    try { return App.currentPackageName() || ''; } catch (e) { return ''; }
  }

  /**
   * 从 UiObject 节点中提取所有属性
   */
  function extractNodeInfo(uio) {
    if (!uio) return null;
    try {
      var bounds = null;
      try { bounds = uio.bounds(); } catch (e) {}

      return {
        id:         safeCall(uio, 'id'),
        text:       safeCall(uio, 'text'),
        desc:       safeCall(uio, 'desc'),
        className:  safeCall(uio, 'className'),
        packageName: safeCall(uio, 'getPackageName'),
        hintText:   safeCall(uio, 'getHintText'),
        bounds:     bounds,   // {left, top, right, bottom}
        depth:      -1,        // 后续赋值
        childCount: safeCall(uio, 'getChildCount', 0),
        clickable:  safeCall(uio, 'isClickable', false),
        longClickable: safeCall(uio, 'isLongClickable', false),
        scrollable: safeCall(uio, 'isScrollable', false),
        editable:   safeCall(uio, 'isEditable', false),
        focusable:  safeCall(uio, 'isFocusable', false),
        focused:    safeCall(uio, 'isFocused', false),
        enabled:    safeCall(uio, 'isEnabled', true),
        selected:   safeCall(uio, 'isSelected', false),
        checked:    safeCall(uio, 'isChecked', false),
        checkable:  safeCall(uio, 'isCheckable', false),
        visible:    safeCall(uio, 'isVisibleToUser', true),
        password:   safeCall(uio, 'isPassword', false),
        drawingOrder: safeCall(uio, 'getDrawingOrder', -1),
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  function safeCall(obj, methodName, fallback) {
    try {
      var result = obj[methodName]();
      return (result === null || result === undefined) ? (fallback !== undefined ? fallback : '') : result;
    } catch (e) {
      return fallback !== undefined ? fallback : '';
    }
  }

  /**
   * 递归遍历节点树
   */
  function traverseTree(uio, depth, results) {
    if (!uio) return;
    try {
      var info = extractNodeInfo(uio);
      if (info) {
        info.depth = depth;
        results.push(info);
      }

      var childCount = info ? info.childCount : 0;
      for (var i = 0; i < childCount; i++) {
        try {
          var child = uio.getChildren ? uio.getChildren(i) : null;
          if (child) {
            traverseTree(child, depth + 1, results);
          }
        } catch (e) {
          // 子节点可能在某些状态下不可访问
        }
      }
    } catch (e) {
      // 节点可能在遍历过程中失效
    }
  }

  /**
   * 获取当前屏幕全部节点 (简单模式 — 仅 APP 层节点)
   */
  function getScreenNodesSimple() {
    var results = [];
    try {
      var root = new UiSelector(false)
        .isVisibleToUser(true)
        .findOnce();
      if (root) {
        traverseTree(root, 0, results);
      }
    } catch (e) {
      Log.log('[NodeInspector] getScreenNodesSimple error: ' + e.message);
    }
    return results;
  }

  /**
   * 获取指定包名的全部节点（递归 from root）
   */
  function getNodesByPackage(packageName) {
    var results = [];
    try {
      var allNodes = UiSelector().find();
      for (var i = 0; i < allNodes.length; i++) {
        try {
          var pkg = allNodes[i].getPackageName();
          if (pkg && pkg.indexOf(packageName) !== -1) {
            results.push(extractNodeInfo(allNodes[i]));
          }
        } catch (e) {}
      }
    } catch (e) {}
    return results;
  }

  // ==========================================================================
  // 格式化输出
  // ==========================================================================

  /**
   * 节点树可视化 — 带缩进的文本树
   */
  function formatAsTree(nodes) {
    var lines = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var indent = '';
      for (var d = 0; d < (n.depth || 0); d++) { indent += '│  '; }

      // 节点类型标记
      var typeTag = [];
      if (n.clickable)  typeTag.push('可点');
      if (n.scrollable) typeTag.push('滚动');
      if (n.editable)   typeTag.push('编辑');
      if (n.text)       typeTag.push('"' + truncate(n.text, 20) + '"');
      var typeStr = typeTag.length > 0 ? ' [' + typeTag.join(', ') + ']' : '';

      var clsShort = n.className ? n.className.split('.').pop() : '?';

      lines.push(indent + '├─ ' + clsShort + typeStr +
        (n.id ? ' #' + n.id.split('/').pop() : '') +
        (n.desc ? ' desc="' + truncate(n.desc, 20) + '"' : ''));
    }
    return lines.join('\n');
  }

  function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  /**
   * 生成 "点击选择器表达式" 列表 — 可直接复制到脚本中使用的定位代码
   */
  function generateSelectorExpressions(nodes) {
    var expressions = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.clickable && !n.editable && !n.text) continue;

      var parts = [];
      if (n.text)       parts.push('.text("' + n.text + '")');
      if (n.desc)       parts.push('.desc("' + n.desc + '")');
      if (n.id && n.id.indexOf('/') !== -1) parts.push('.id("' + n.id + '")');
      if (n.className)  parts.push('.className("' + n.className + '")');

      if (parts.length > 0) {
        var boundsInfo = n.bounds ?
          ' // (' + n.bounds.left + ',' + n.bounds.top + ')-(' + n.bounds.right + ',' + n.bounds.bottom + ')' : '';
        expressions.push('UiSelector()' + parts.join('') + '.findOnce()' + boundsInfo);
      }
    }
    return expressions;
  }

  /**
   * 获取关键可交互节点列表（按钮、输入框、可点击文本等）
   */
  function getInteractiveNodes(nodes) {
    return nodes.filter(function (n) {
      return n.clickable || n.editable || n.longClickable ||
        (n.text && n.text.length > 0) ||
        (n.desc && n.desc.length > 0);
    });
  }

  // ==========================================================================
  // 公开 API
  // ==========================================================================

  /**
   * 导出当前屏幕完整节点信息
   * @param {string} label 可选标签（用于区分不同页面）
   */
  function dumpCurrentScreen(label) {
    var pkg = getCurrentPackage();
    label = label || ('screen_' + Date.now());

    Log.log('=============== Node Inspector ===============');
    Log.log('Package: ' + pkg);
    Log.log('Label: ' + label);
    Log.log('==============================================');

    // 简单模式 — 只获取可见节点
    var nodes = getScreenNodesSimple();
    Log.log('Total nodes (simple mode): ' + nodes.length);

    // 交互节点
    var interactive = getInteractiveNodes(nodes);
    Log.log('Interactive nodes: ' + interactive.length);

    // 输出树状结构（限制深度避免日志过长）
    var shallowNodes = nodes.filter(function (n) { return (n.depth || 0) <= 8; });
    var tree = formatAsTree(shallowNodes);
    Log.log('\n--- Node Tree (depth <= 8) ---\n' + tree);

    // 输出选择器表达式
    var selectors = generateSelectorExpressions(interactive);
    Log.log('\n--- Selector Expressions ---\n' + selectors.join('\n'));

    // 存入 Storage 供后续查阅
    var dump = {
      package: pkg,
      label: label,
      timestamp: time(),
      totalNodes: nodes.length,
      interactiveCount: interactive.length,
      interactiveNodes: interactive,
      selectorExpressions: selectors,
    };
    Storage.put('node_dump_' + label, JSON.stringify(dump));

    Log.log('\nDump saved: node_dump_' + label);
    Log.log('==============================================');

    return dump;
  }

  /**
   * 实时监听模式 — 每 N 秒抓取一次节点变化
   * @param {number} intervalMs 抓取间隔（毫秒）
   */
  function watchApp(intervalMs) {
    intervalMs = intervalMs || 3000;
    var lastPkg = '';
    var lastHash = '';

    Log.log('[NodeInspector] 开始监听 APP 变化，间隔 ' + intervalMs + 'ms');

    var timer = setInterval(function () {
      var pkg = getCurrentPackage();
      if (pkg !== lastPkg) {
        Log.log('[NodeInspector] APP 切换: ' + lastPkg + ' -> ' + pkg);
        lastPkg = pkg;
      }

      var nodes = getScreenNodesSimple();
      var interactive = getInteractiveNodes(nodes);

      // 简单哈希检测 UI 变化
      var hash = '' + nodes.length + '_' + interactive.length;
      if (hash !== lastHash) {
        Log.log('[NodeInspector] UI 变化: ' + nodes.length + ' nodes, ' + interactive.length + ' interactive');
        lastHash = hash;

        // 自动保存
        var dump = {
          package: pkg,
          timestamp: time(),
          totalNodes: nodes.length,
          interactiveNodes: interactive,
        };
        Storage.put('node_watch_latest', JSON.stringify(dump));
      }
    }, intervalMs);

    // 返回停止函数
    return {
      stop: function () { clearInterval(timer); },
      timer: timer,
    };
  }

  /**
   * 获取最后一次 dump 的数据
   */
  function getLastDump(label) {
    try {
      var key = label ? 'node_dump_' + label : 'node_watch_latest';
      var data = Storage.get(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 按平台获取通用 APP 包名
   */
  var KNOWN_PACKAGES = {
    douyin:      'com.ss.android.ugc.aweme',
    douyin_lite: 'com.ss.android.ugc.aweme.lite',
    kuaishou:    'com.smile.gifmaker',
    kuaishou_lite: 'com.kuaishou.nebula',
    weixin:      'com.tencent.mm',
    xiaohongshu: 'com.xingin.xhs',
    taobao:      'com.taobao.taobao',
    jd:          'com.jingdong.app.mall',
    pdd:         'com.xunmeng.pinduoduo',
    meituan:     'com.sankuai.meituan',
  };

  return {
    dumpCurrentScreen: dumpCurrentScreen,
    watchApp: watchApp,
    getLastDump: getLastDump,
    getScreenNodesSimple: getScreenNodesSimple,
    getInteractiveNodes: getInteractiveNodes,
    getCurrentPackage: getCurrentPackage,
    getNodesByPackage: getNodesByPackage,
    KNOWN_PACKAGES: KNOWN_PACKAGES,
    formatAsTree: formatAsTree,
    generateSelectorExpressions: generateSelectorExpressions,
    extractNodeInfo: extractNodeInfo,
  };
})();

// ==========================================================================
// 快速使用示例 — 取消注释运行
// ==========================================================================

// 1. 导出当前屏幕节点到 Log + Storage
// nodeInspector.dumpCurrentScreen('my_test');

// 2. 开启监听模式（每 3 秒检测一次 UI 变化）
// nodeInspector.watchApp(3000);

// 3. 获取特定 APP 的节点信息
// var nodes = nodeInspector.getNodesByPackage(nodeInspector.KNOWN_PACKAGES.douyin);
// Log.log('抖音节点: ' + nodes.length);

// 4. 生成可直接使用的选择器代码
// var dump = nodeInspector.dumpCurrentScreen();
// dump.selectorExpressions.forEach(function(s) { Log.log(s); });

Log.log('[NodeInspector] 节点检查器已加载。使用 nodeInspector.dumpCurrentScreen() 导出当前屏幕节点');
