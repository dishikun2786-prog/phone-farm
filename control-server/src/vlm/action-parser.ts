/**
 * Action Parser — Parses raw VLM model output into structured VLMAction objects.
 *
 * Each supported model family has a different output format:
 * - AutoGLM / UI-TARS: <think>...</think><answer>do(action="Tap", element=[x,y])</answer>
 * - Qwen-VL / MAI-UI / GUI-Owl: JSON {"action": "tap", "x": 540, "y": 1200}
 *
 * Coordinate normalization strategy (from ClawGUI):
 * - AutoGLM: normalized [0, 1000] → denormalize to screen pixels
 * - UI-TARS: absolute pixels in smart_resize space → scale
 * - Qwen-VL: absolute pixels → use directly
 * - MAI-UI: normalized [0, 1000] → denormalize
 * - GUI-Owl: absolute pixels → use directly
 */

import { type VLMAction, type ModelType } from './vlm-client';

export interface ParseResult {
  action: VLMAction;
  thinking: string;
  finished: boolean;
}

interface ScreenDims {
  width: number;
  height: number;
}

/**
 * Parse model output based on model type.
 */
export function parseAction(
  rawContent: string,
  modelType: ModelType,
  screen: ScreenDims
): ParseResult {
  switch (modelType) {
    case 'autoglm':
    case 'uitars':
      return parseAutoGLM(rawContent, screen, modelType);
    case 'qwenvl':
    case 'maiui':
    case 'guiowl':
      return parseJSONFormat(rawContent, screen, modelType);
    default:
      return parseAutoGLM(rawContent, screen, 'autoglm');
  }
}

/**
 * Parse AutoGLM format: <think>...</think><answer>do(...)</answer>
 * Coordinates are normalized to [0, 1000] range → denormalize to screen pixels.
 */
function parseAutoGLM(raw: string, screen: ScreenDims, _modelType: ModelType): ParseResult {
  const thinking = extractBetween(raw, '<think>', '</think>') || '';
  const answer = extractBetween(raw, '<answer>', '</answer>') || raw;

  // finish(message="...")
  const finishMatch = answer.match(/finish\s*\(\s*message\s*=\s*"([^"]*)"/);
  if (finishMatch) {
    return {
      action: { type: 'terminate', message: finishMatch[1] },
      thinking,
      finished: true,
    };
  }

  // do(action="Tap", element=[x,y]) or do(action="Swipe", start=[x1,y1], end=[x2,y2])
  const doMatch = answer.match(/do\s*\(([\s\S]*?)\)/);
  if (!doMatch) {
    return { action: { type: 'tap', x: screen.width / 2, y: screen.height / 2 }, thinking, finished: false };
  }

  const params = doMatch[1];
  const atype = extractQuoted(params, 'action') || 'Tap';

  switch (atype) {
    case 'Tap':
    case 'LongPress': {
      const coords = extractCoords(params, 'element');
      if (coords) {
        return {
          action: { type: atype === 'LongPress' ? 'long_press' : 'tap', x: denorm(coords[0], screen.width), y: denorm(coords[1], screen.height) },
          thinking, finished: false,
        };
      }
      break;
    }
    case 'Swipe': {
      const start = extractCoords(params, 'start');
      const end = extractCoords(params, 'end');
      if (start && end) {
        return {
          action: {
            type: 'swipe',
            x: denorm(start[0], screen.width), y: denorm(start[1], screen.height),
            x2: denorm(end[0], screen.width), y2: denorm(end[1], screen.height),
          },
          thinking, finished: false,
        };
      }
      break;
    }
    case 'Type': {
      const text = extractQuoted(params, 'text');
      if (text) return { action: { type: 'type', text }, thinking, finished: false };
      break;
    }
    case 'Back':  return { action: { type: 'back' }, thinking, finished: false };
    case 'Home':  return { action: { type: 'home' }, thinking, finished: false };
    case 'Launch': {
      const app = extractQuoted(params, 'app');
      if (app) return { action: { type: 'launch', package: app }, thinking, finished: false };
      break;
    }
  }

  return { action: { type: 'tap', x: screen.width / 2, y: screen.height / 2 }, thinking, finished: false };
}

/**
 * Parse JSON format: {"action": "tap", "x": 540, "y": 1200, "thinking": "..."}
 */
function parseJSONFormat(raw: string, screen: ScreenDims, modelType: ModelType): ParseResult {
  let thinking = '';
  let finished = false;

  const jsonMatch = raw.match(/\{[\s\S]*"action"[\s\S]*\}/);
  if (!jsonMatch) {
    return { action: { type: 'tap', x: screen.width / 2, y: screen.height / 2 }, thinking, finished: false };
  }

  try {
    const obj = JSON.parse(jsonMatch[0]);
    thinking = obj.thinking || '';

    const atype: string = obj.action || 'tap';

    if (atype === 'terminate' || atype === 'answer') {
      return { action: { type: 'terminate', message: obj.message || obj.answer || 'Done' }, thinking, finished: true };
    }

    if (atype === 'tap') {
      const { x, y } = denormJSONCoords(obj, screen, modelType);
      return { action: { type: 'tap', x, y }, thinking, finished: false };
    }

    if (atype === 'swipe') {
      const start = denormJSONCoords({ x: obj.x1 ?? obj.x, y: obj.y1 ?? obj.y }, screen, modelType);
      const end = denormJSONCoords({ x: obj.x2, y: obj.y2 }, screen, modelType);
      return { action: { type: 'swipe', x: start.x, y: start.y, x2: end.x, y2: end.y }, thinking, finished: false };
    }

    if (atype === 'type') {
      return { action: { type: 'type', text: obj.text || '' }, thinking, finished: false };
    }

    if (atype === 'back') return { action: { type: 'back' }, thinking, finished: false };
    if (atype === 'home') return { action: { type: 'home' }, thinking, finished: false };
    if (atype === 'launch') return { action: { type: 'launch', package: obj.package || obj.app || '' }, thinking, finished: false };
  } catch {
    // JSON parse failed, fall through to center tap
  }

  return { action: { type: 'tap', x: screen.width / 2, y: screen.height / 2 }, thinking, finished: false };
}

// ── Helpers ──

function extractBetween(text: string, start: string, end: string): string | null {
  const idx = text.indexOf(start);
  if (idx === -1) return null;
  const endIdx = text.indexOf(end, idx + start.length);
  if (endIdx === -1) return text.slice(idx + start.length);
  return text.slice(idx + start.length, endIdx);
}

function extractQuoted(text: string, key: string): string | null {
  const m = text.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

function extractCoords(text: string, key: string): [number, number] | null {
  const m = text.match(new RegExp(`${key}\\s*=\\s*\\[(\\d+)\\s*,\\s*(\\d+)\\]`));
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

/** Denormalize from [0, 1000] to screen pixels. */
function denorm(v: number, screenSize: number): number {
  return Math.round((v / 1000) * screenSize);
}

function denormJSONCoords(
  obj: Record<string, unknown>,
  screen: ScreenDims,
  modelType: ModelType
): { x: number; y: number } {
  // MAI-UI and AutoGLM use [0, 1000] normalization; Qwen-VL and GUI-Owl use absolute pixels
  const needsDenorm = modelType === 'maiui' || modelType === 'autoglm';
  if (needsDenorm) {
    return {
      x: Math.round(((obj.x as number) || 0) / 1000 * screen.width),
      y: Math.round(((obj.y as number) || 0) / 1000 * screen.height),
    };
  }
  return {
    x: (obj.x as number) || screen.width / 2,
    y: (obj.y as number) || screen.height / 2,
  };
}
