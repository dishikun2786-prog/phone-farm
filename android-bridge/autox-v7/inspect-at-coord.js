/**
 * inspect-at-coord.js — Coordinate → UI Selector Mapper (AutoX v7 原生版)
 *
 * 使用 AutoX v7 原生 API:
 *   auto.rootInActiveWindow (替代 Accessibility.getRootInActiveWindow)
 *   UiObject 原生属性: .id() / .text() / .desc() / .className() / .bounds() / .childCount() / .child() / .clickable() / .recycle()
 *
 * 不依赖 compat.js 适配层。
 *
 * 选择器优先级 (稳定性从高到低):
 *   1. viewIdResourceName (id) — 最稳定
 *   2. text + className — 带标签的按钮
 *   3. contentDescription (desc) — 图标按钮
 *   4. text 单独
 *   5. className 单独
 *   6. 坐标兜底 (最不稳定)
 */

function inspectAtCoordinate(x, y) {
  try {
    var root = auto.rootInActiveWindow;
    if (!root) {
      return { type: 'coordinate', value: '', x: x, y: y, stability: 0,
               bounds: null, error: 'No active window root' };
    }

    var node = findNodeAt(root, x, y);

    if (!node) {
      return { type: 'coordinate', value: '', x: x, y: y, stability: 0,
               bounds: null, error: 'No node found at coordinates' };
    }

    var id = safeProp(node, 'id');
    var text = safeProp(node, 'text');
    var desc = safeProp(node, 'desc');
    var className = safeProp(node, 'className');
    var bounds = safeProp(node, 'bounds');

    var selector;

    if (id && id.length > 0) {
      selector = { type: 'id', value: id, className: className, stability: 100, bounds: bounds };
    } else if (text && text.length > 0 && className) {
      selector = { type: 'text', value: text, className: className, stability: 80, bounds: bounds };
    } else if (desc && desc.length > 0) {
      selector = { type: 'desc', value: desc, className: className, stability: 60, bounds: bounds };
    } else if (text && text.length > 0) {
      selector = { type: 'text', value: text, className: className, stability: 70, bounds: bounds };
    } else if (className && className.length > 0) {
      selector = { type: 'className', value: className, className: className, stability: 30, bounds: bounds };
    } else {
      selector = { type: 'coordinate', value: '', x: x, y: y, stability: 0,
                   className: className, bounds: bounds };
    }

    try { node.recycle(); } catch (e) {}

    return selector;

  } catch (e) {
    return { type: 'coordinate', value: '', x: x, y: y, stability: 0,
             bounds: null, error: String(e) };
  }
}

function safeProp(node, prop) {
  try {
    if (!node) return '';
    var val = node[prop];
    if (typeof val === 'function') val = val.call(node);
    return (val === null || val === undefined) ? '' : String(val);
  } catch (e) { return ''; }
}

function findNodeAt(node, x, y) {
  if (!node) return null;

  var bounds = safeProp(node, 'bounds');
  if (!bounds) return null;

  var inBounds = x >= bounds.left && x <= bounds.right &&
                 y >= bounds.top && y <= bounds.bottom;
  if (!inBounds) return null;

  var childCount = safeProp(node, 'childCount');
  if (typeof childCount === 'number') {
    for (var i = 0; i < childCount; i++) {
      try {
        var child = node.child ? node.child(i) : null;
        if (child) {
          var found = findNodeAt(child, x, y);
          if (found) return found;
        }
      } catch (e) {}
    }
  }

  var isClickable = safeProp(node, 'clickable');
  var text = safeProp(node, 'text');
  var desc = safeProp(node, 'desc');
  var id = safeProp(node, 'id');

  if (isClickable || text || desc || id) return node;

  return null;
}

global.inspectAtCoordinate = inspectAtCoordinate;
