/**
 * Built-in keymap presets — ready-to-use keyboard mappings for popular apps.
 *
 * All coordinates are in percentage (0-100) for cross-device compatibility.
 */
import type { KeyMapProfile } from './keymap-engine';

const NOW = new Date().toISOString();

export const BUILTIN_KEYMAP_PROFILES: Omit<KeyMapProfile, 'id'>[] = [
  {
    name: 'TikTok 上下滑动',
    platform: '抖音',
    deviceResolution: { width: 1080, height: 2400 },
    mappings: [
      { keyCode: 'ArrowUp', keyName: '↑', action: 'swipe', fromX: 50, fromY: 65, toX: 50, toY: 35, duration: 300 },
      { keyCode: 'ArrowDown', keyName: '↓', action: 'swipe', fromX: 50, fromY: 35, toX: 50, toY: 65, duration: 300 },
      { keyCode: 'KeyL', keyName: 'L', action: 'tap', x: 85, y: 55 },
      { keyCode: 'KeyF', keyName: 'F', action: 'tap', x: 85, y: 45 },
      { keyCode: 'Space', keyName: 'Space', action: 'tap', x: 50, y: 90 },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    name: 'TikTok 评论互动',
    platform: '抖音',
    deviceResolution: { width: 1080, height: 2400 },
    mappings: [
      { keyCode: 'ArrowUp', keyName: '↑', action: 'swipe', fromX: 50, fromY: 65, toX: 50, toY: 35, duration: 300 },
      { keyCode: 'ArrowDown', keyName: '↓', action: 'swipe', fromX: 50, fromY: 35, toX: 50, toY: 65, duration: 300 },
      { keyCode: 'KeyC', keyName: 'C', action: 'tap', x: 85, y: 82 },
      { keyCode: 'Space', keyName: 'Space', action: 'tap', x: 50, y: 90 },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    name: '微信视频号浏览',
    platform: '微信',
    deviceResolution: { width: 1080, height: 2400 },
    mappings: [
      { keyCode: 'ArrowUp', keyName: '↑', action: 'swipe', fromX: 50, fromY: 70, toX: 50, toY: 30, duration: 300 },
      { keyCode: 'ArrowDown', keyName: '↓', action: 'swipe', fromX: 50, fromY: 30, toX: 50, toY: 70, duration: 300 },
      { keyCode: 'KeyL', keyName: 'L', action: 'tap', x: 85, y: 55 },
      { keyCode: 'Escape', keyName: 'Esc', action: 'tap', x: 5, y: 5 },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    name: '快手推荐浏览',
    platform: '快手',
    deviceResolution: { width: 1080, height: 2400 },
    mappings: [
      { keyCode: 'ArrowUp', keyName: '↑', action: 'swipe', fromX: 50, fromY: 65, toX: 50, toY: 35, duration: 300 },
      { keyCode: 'ArrowDown', keyName: '↓', action: 'swipe', fromX: 50, fromY: 35, toX: 50, toY: 65, duration: 300 },
      { keyCode: 'KeyL', keyName: 'L', action: 'tap', x: 85, y: 55 },
      { keyCode: 'Space', keyName: 'Space', action: 'tap', x: 50, y: 90 },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    name: '通用导航',
    platform: '通用',
    deviceResolution: { width: 1080, height: 2400 },
    mappings: [
      { keyCode: 'Escape', keyName: 'Esc', action: 'tap', x: 5, y: 5 },
      { keyCode: 'Home', keyName: 'Home', action: 'tap', x: 50, y: 92 },
      { keyCode: 'ContextMenu', keyName: 'Menu', action: 'tap', x: 50, y: 92 },
      { keyCode: 'ArrowUp', keyName: '↑', action: 'swipe', fromX: 50, fromY: 70, toX: 50, toY: 30, duration: 300 },
      { keyCode: 'ArrowDown', keyName: '↓', action: 'swipe', fromX: 50, fromY: 30, toX: 50, toY: 70, duration: 300 },
      { keyCode: 'ArrowLeft', keyName: '←', action: 'swipe', fromX: 30, fromY: 50, toX: 70, toY: 50, duration: 200 },
      { keyCode: 'ArrowRight', keyName: '→', action: 'swipe', fromX: 70, fromY: 50, toX: 30, toY: 50, duration: 200 },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  },
];
