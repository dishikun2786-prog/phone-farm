/**
 * node-inspector.js — AutoX v7 原生无障碍节点检查器
 *
 * 使用 AutoX v7 原生 API:
 *   selector() / auto.rootInActiveWindow / currentPackage()
 *
 * 不依赖 compat.js 适配层。
 *
 * 功能:
 * 1. 获取当前屏幕完整的无障碍节点树
 * 2. 按 APP 自动分类，导出结构化节点信息
 * 3. 支持简单模式/复杂模式切换
 * 4. 输出到 Log + storages，供开发脚本时参考
 */

var nodeInspector = (function () {
  'use strict';

  function getCurrentPackage() {
    try { return currentPackage() || ''; } catch (e) { return ''; }
  }

  function safeGet(obj, prop, fallback) {
    try {
      var val = obj[prop];
      if (typeof val === 'function') val = val.call(obj);
      return (val === null || val === undefined) ? (fallback !== undefined ? fallback : '') : val;
    } catch (e) {
      try {
        // AutoX properties may be accessed as methods too
        if (typeof obj[prop] === 'function') {
          return obj[prop]() || (fallback !== undefined ? fallback : '');
        }
      } catch (e2) {}
      return fallback !== undefined ? fallback : '';
    }
  }

  function extractNodeInfo(uio) {
    if (!uio) return null;
    try {
      var bounds = null;
      try { bounds = safeGet(uio, 'bounds'); } catch (e) {}

      return {
        id:          safeGet(uio, 'id'),
        text:        safeGet(uio, 'text'),
        desc:        safeGet(uio, 'desc'),
        className:   safeGet(uio, 'className'),
        packageName: safeGet(uio, 'packageName'),
        hintText:    '',
        bounds:      bounds,
        depth:       -1,
        childCount:  safeGet(uio, 'childCount', 0),
        clickable:   safeGet(uio, 'clickable', false),
        longClickable: safeGet(uio, 'longClickable', false),
        scrollable:  safeGet(uio, 'scrollable', false),
        editable:    safeGet(uio, 'editable', false),
        focusable:   safeGet(uio, 'focusable', false),
        focused:     safeGet(uio, 'focused', false),
        enabled:     safeGet(uio, 'enabled', true),
        selected:    safeGet(uio, 'selected', false),
        checked:     safeGet(uio, 'checked', false),
        checkable:   safeGet(uio, 'checkable', false),
        visible:     safeGet(uio, 'visibleToUser', true),
        password:    safeGet(uio, 'password', false),
        drawingOrder: -1,
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  function traverseTree(uio, depth, results) {
    if (!uio) return;
    try {
      var info = extractNodeInfo(uio);
      if (info) { info.depth = depth; results.push(info); }

      var childCount = info ? info.childCount : 0;
      for (var i = 0; i < childCount; i++) {
        try {
          var child = uio.child ? uio.child(i) : null;
          if (child) traverseTree(child, depth + 1, results);
        } catch (e) {}
      }
    } catch (e) {}
  }

  function getScreenNodesSimple() {
    var results = [];
    try {
      var root = selector().visibleToUser(true).findOnce();
      if (root) traverseTree(root, 0, results);
    } catch (e) {
      log('[NodeInspector] getScreenNodesSimple error: ' + e.message);
    }
    return results;
  }

  function getNodesByPackage(packageName) {
    var results = [];
    try {
      var allNodes = selector().find();
      for (var i = 0; i < allNodes.length; i++) {
        try {
          var pkg = safeGet(allNodes[i], 'packageName');
          if (pkg && pkg.indexOf(packageName) !== -1) {
            results.push(extractNodeInfo(allNodes[i]));
          }
        } catch (e) {}
      }
    } catch (e) {}
    return results;
  }

  function formatAsTree(nodes) {
    var lines = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var indent = '';
      for (var d = 0; d < (n.depth || 0); d++) indent += '|  ';

      var typeTag = [];
      if (n.clickable)  typeTag.push('clickable');
      if (n.scrollable) typeTag.push('scrollable');
      if (n.editable)   typeTag.push('editable');
      if (n.text)       typeTag.push('"' + truncate(n.text, 20) + '"');
      var typeStr = typeTag.length > 0 ? ' [' + typeTag.join(', ') + ']' : '';

      var clsShort = n.className ? n.className.split('.').pop() : '?';

      lines.push(indent + '+- ' + clsShort + typeStr +
        (n.id ? ' #' + n.id.split('/').pop() : '') +
        (n.desc ? ' desc="' + truncate(n.desc, 20) + '"' : ''));
    }
    return lines.join('\n');
  }

  function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

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
        expressions.push('selector()' + parts.join('') + '.findOnce()' + boundsInfo);
      }
    }
    return expressions;
  }

  function getInteractiveNodes(nodes) {
    var result = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.clickable || n.editable || n.longClickable ||
          (n.text && n.text.length > 0) ||
          (n.desc && n.desc.length > 0)) {
        result.push(n);
      }
    }
    return result;
  }

  function dumpCurrentScreen(label) {
    var pkg = getCurrentPackage();
    label = label || ('screen_' + Date.now());

    log('=============== Node Inspector (AutoX v7) ===============');
    log('Package: ' + pkg);
    log('Label: ' + label);
    log('==========================================================');

    var nodes = getScreenNodesSimple();
    log('Total nodes (simple mode): ' + nodes.length);

    var interactive = getInteractiveNodes(nodes);
    log('Interactive nodes: ' + interactive.length);

    var shallowNodes = [];
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].depth || 0) <= 8) shallowNodes.push(nodes[i]);
    }
    var tree = formatAsTree(shallowNodes);
    log('\n--- Node Tree (depth <= 8) ---\n' + tree);

    var selectors = generateSelectorExpressions(interactive);
    log('\n--- Selector Expressions ---\n' + selectors.join('\n'));

    var dump = {
      package: pkg,
      label: label,
      timestamp: new Date().toISOString(),
      totalNodes: nodes.length,
      interactiveCount: interactive.length,
      interactiveNodes: interactive,
      selectorExpressions: selectors,
    };

    var s = storages.create('phonefarm');
    s.put('node_dump_' + label, JSON.stringify(dump));

    log('\nDump saved: node_dump_' + label);
    log('==========================================================');

    return dump;
  }

  function watchApp(intervalMs) {
    intervalMs = intervalMs || 3000;
    var lastPkg = '';
    var lastHash = '';

    log('[NodeInspector] 开始监听 APP 变化，间隔 ' + intervalMs + 'ms');

    var timer = setInterval(function () {
      var pkg = getCurrentPackage();
      if (pkg !== lastPkg) {
        log('[NodeInspector] APP 切换: ' + lastPkg + ' -> ' + pkg);
        lastPkg = pkg;
      }

      var nodes = getScreenNodesSimple();
      var interactive = getInteractiveNodes(nodes);

      var hash = '' + nodes.length + '_' + interactive.length;
      if (hash !== lastHash) {
        log('[NodeInspector] UI 变化: ' + nodes.length + ' nodes, ' + interactive.length + ' interactive');
        lastHash = hash;

        var dump = {
          package: pkg,
          timestamp: new Date().toISOString(),
          totalNodes: nodes.length,
          interactiveNodes: interactive,
        };
        var s = storages.create('phonefarm');
        s.put('node_watch_latest', JSON.stringify(dump));
      }
    }, intervalMs);

    return { stop: function () { clearInterval(timer); }, timer: timer };
  }

  function getLastDump(label) {
    try {
      var s = storages.create('phonefarm');
      var key = label ? 'node_dump_' + label : 'node_watch_latest';
      var data = s.get(key, null);
      return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
  }

  var KNOWN_PACKAGES = {
    douyin: 'com.ss.android.ugc.aweme',
    douyin_lite: 'com.ss.android.ugc.aweme.lite',
    kuaishou: 'com.smile.gifmaker',
    kuaishou_lite: 'com.kuaishou.nebula',
    weixin: 'com.tencent.mm',
    xiaohongshu: 'com.xingin.xhs',
    taobao: 'com.taobao.taobao',
    jd: 'com.jingdong.app.mall',
    pdd: 'com.xunmeng.pinduoduo',
    meituan: 'com.sankuai.meituan',
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

log('[NodeInspector] AutoX v7 节点检查器已加载');
