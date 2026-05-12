/**
 * KeymapEngine — keyboard-to-touch coordinate mapping engine.
 *
 * Parses keymap profiles (compatible with QtScrcpy keymap script format)
 * and converts KeyboardEvent codes into touch/scroll injection commands.
 *
 * All coordinates are stored as percentages (0-100) for cross-device compatibility.
 */
export interface KeyMapping {
  keyCode: string;
  keyName: string;
  action: 'tap' | 'swipe' | 'long_press' | 'repeat';
  x?: number;
  y?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  duration?: number;
  repeatInterval?: number;
}

export interface KeyMapProfile {
  id: string;
  name: string;
  platform: string;
  deviceResolution: { width: number; height: number };
  switchKey?: string;
  mouseSpeed?: { x: number; y: number };
  mappings: KeyMapping[];
  createdAt: string;
  updatedAt: string;
}

/**
 * QtScrcpy-compatible keymap JSON schema:
 * {
 *   "switchKeyMap": { "key": "RightAlt" },
 *   "mouseMoveMap": { "speed": { "x": 1.2, "y": 1.2 } },
 *   "keyMapNodes": [
 *     { "key": "Space", "action": "touch", "pos": [540, 1800] },
 *     { "key": "KeyW", "action": "swipe", "swipe": [540, 800, 540, 500], "duration": 300 }
 *   ]
 * }
 */
interface QtScrcpyKeyMapNode {
  key: string;
  action: string;
  pos?: [number, number];
  swipe?: [number, number, number, number];
  duration?: number;
}

interface QtScrcpyKeyMap {
  switchKeyMap?: { key: string };
  mouseMoveMap?: { speed: { x: number; y: number } };
  keyMapNodes?: QtScrcpyKeyMapNode[];
}

export function importQtScrcpyKeymap(json: QtScrcpyKeyMap, name: string, resolution: { width: number; height: number }): Omit<KeyMapProfile, 'id' | 'createdAt' | 'updatedAt'> {
  const mappings: KeyMapping[] = (json.keyMapNodes || []).map(node => {
    const keyName = node.key.replace(/^Key/, '');
    const mapping: KeyMapping = {
      keyCode: node.key,
      keyName,
      action: node.action === 'swipe' ? 'swipe' : node.action === 'long_press' ? 'long_press' : 'tap',
    };

    if (node.pos) {
      mapping.x = (node.pos[0]! / resolution.width) * 100;
      mapping.y = (node.pos[1]! / resolution.height) * 100;
    }
    if (node.swipe) {
      mapping.fromX = (node.swipe[0]! / resolution.width) * 100;
      mapping.fromY = (node.swipe[1]! / resolution.height) * 100;
      mapping.toX = (node.swipe[2]! / resolution.width) * 100;
      mapping.toY = (node.swipe[3]! / resolution.height) * 100;
      mapping.duration = node.duration || 300;
    }

    return mapping;
  });

  return {
    name,
    platform: '通用',
    deviceResolution: resolution,
    switchKey: json.switchKeyMap?.key,
    mouseSpeed: json.mouseMoveMap?.speed,
    mappings,
  };
}

export function convertKeyToTouch(
  mapping: KeyMapping,
  deviceWidth: number,
  deviceHeight: number,
): { type: string; x: number; y: number; action?: string; pressure?: number; duration?: number; fromX?: number; fromY?: number; toX?: number; toY?: number } | null {
  switch (mapping.action) {
    case 'tap':
      if (mapping.x == null || mapping.y == null) return null;
      return {
        type: 'touch',
        action: 'tap',
        x: (mapping.x / 100) * deviceWidth,
        y: (mapping.y / 100) * deviceHeight,
        pressure: 1,
      };
    case 'long_press':
      if (mapping.x == null || mapping.y == null) return null;
      return {
        type: 'touch',
        action: 'long_press',
        x: (mapping.x / 100) * deviceWidth,
        y: (mapping.y / 100) * deviceHeight,
        pressure: 1,
        duration: mapping.duration || 800,
      };
    case 'swipe':
      if (mapping.fromX == null || mapping.fromY == null || mapping.toX == null || mapping.toY == null) return null;
      return {
        type: 'touch',
        action: 'swipe',
        x: (mapping.toX / 100) * deviceWidth,
        y: (mapping.toY / 100) * deviceHeight,
        fromX: (mapping.fromX / 100) * deviceWidth,
        fromY: (mapping.fromY / 100) * deviceHeight,
        toX: (mapping.toX / 100) * deviceWidth,
        toY: (mapping.toY / 100) * deviceHeight,
        duration: mapping.duration || 300,
      };
    case 'repeat':
      if (mapping.x == null || mapping.y == null) return null;
      return {
        type: 'touch',
        action: 'repeat',
        x: (mapping.x / 100) * deviceWidth,
        y: (mapping.y / 100) * deviceHeight,
        pressure: 1,
      };
    default:
      return null;
  }
}

export function matchKeymap(keyCode: string, profile: KeyMapProfile): KeyMapping | undefined {
  return profile.mappings.find(m => m.keyCode === keyCode);
}
