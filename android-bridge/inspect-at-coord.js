/**
 * Coordinate Inspector — maps screen coordinates to UI node selectors.
 *
 * Extends node-inspector.js with a new function: inspectAtCoordinate(x, y)
 * Returns the best UiSelector expression for the UI element at the given coordinate.
 *
 * This runs ON THE PHONE (DeekeScript runtime). Called during script compilation
 * to convert VLM coordinate actions into stable UI selector actions.
 *
 * DeekeScript API reference: https://doc.deeke.cn
 */

/**
 * Inspect the UI node at the given coordinate and return the best selector.
 *
 * Selector priority (stability high → low):
 *   1. viewIdResourceName (id) — most stable across versions
 *   2. text + className — good for labeled buttons
 *   3. contentDescription (desc) — good for icon buttons
 *   4. text alone
 *   5. className alone
 *   6. coordinate fallback (least stable)
 *
 * @param {number} x - Screen X coordinate in pixels
 * @param {number} y - Screen Y coordinate in pixels
 * @returns {object} { type, value, className, stability, bounds }
 */
function inspectAtCoordinate(x, y) {
  try {
    // Use Android AccessibilityService to find the node at the coordinate
    var root = Accessibility.getRootInActiveWindow();
    if (!root) {
      return { type: 'coordinate', value: '', x: x, y: y, stability: 0,
               bounds: null, error: 'No active window root' };
    }

    // Walk the tree to find the smallest node containing (x, y)
    var node = findNodeAt(root, x, y);

    if (!node) {
      return { type: 'coordinate', value: '', x: x, y: y, stability: 0,
               bounds: null, error: 'No node found at coordinates' };
    }

    // Extract node properties
    var id = node.getViewIdResourceName ? node.getViewIdResourceName() : '';
    var text = node.getText ? node.getText() : '';
    var desc = node.getContentDescription ? node.getContentDescription() : '';
    var className = node.getClassName ? node.getClassName() : '';
    var bounds = node.getBounds ? node.getBounds() : null;

    // Determine best selector by stability priority
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

    // Clean up
    try { node.recycle(); } catch (e) { /* ignore */ }

    return selector;

  } catch (e) {
    return { type: 'coordinate', value: '', x: x, y: y, stability: 0,
             bounds: null, error: String(e) };
  }
}

/**
 * Recursively find the deepest node containing (x, y).
 * Returns the leaf-most clickable node at the coordinate.
 */
function findNodeAt(node, x, y) {
  if (!node) return null;

  var bounds = node.getBounds ? node.getBounds() : null;
  if (!bounds) return null;

  var inBounds = x >= bounds.left && x <= bounds.right &&
                 y >= bounds.top && y <= bounds.bottom;
  if (!inBounds) return null;

  // Check children first (depth-first) for more specific hits
  var childCount = node.getChildCount ? node.getChildCount() : 0;
  for (var i = 0; i < childCount; i++) {
    try {
      var child = node.getChild(i);
      if (child) {
        var found = findNodeAt(child, x, y);
        if (found) return found;
      }
    } catch (e) { /* skip */ }
  }

  // Return this node if it's clickable or has identifiable text/desc
  var isClickable = node.isClickable ? node.isClickable() : false;
  var text = node.getText ? node.getText() : '';
  var desc = node.getContentDescription ? node.getContentDescription() : '';
  var id = node.getViewIdResourceName ? node.getViewIdResourceName() : '';

  if (isClickable || text || desc || id) {
    return node;
  }

  return null;
}

// Export to global scope
global.inspectAtCoordinate = inspectAtCoordinate;
