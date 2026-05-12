/**
 * VLM Client — HTTP wrapper for the Python VLM Bridge service.
 *
 * @deprecated 由 DeepSeekClient + QwenVLClient (src/decision/) 替代。
 *   保留用于 FF_LEGACY_VLM=true 回退兼容。
 *
 * Handles OpenAI-compatible API calls with retry and timeout.
 */
import { config } from '../config';

export interface VLMScreenshot {
  base64: string;
  width: number;
  height: number;
}

export interface VLMRequest {
  task: string;
  screenshot: VLMScreenshot;
  history: Array<{ screenshot?: string; action?: Record<string, unknown> }>;
  currentApp: string;
  lang: string;
  stepNumber: number;
}

export interface VLMAction {
  type: 'tap' | 'swipe' | 'type' | 'back' | 'home' | 'launch' | 'long_press' | 'terminate' | 'answer';
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  text?: string;
  package?: string;
  message?: string;
}

export interface VLMResponse {
  action: VLMAction;
  thinking: string;
  finished: boolean;
  rawContent: string;
}

export type ModelType = 'autoglm' | 'qwenvl' | 'uitars' | 'maiui' | 'guiowl';

export function detectModelType(modelName: string): ModelType {
  const lower = modelName.toLowerCase();
  if (lower.includes('autoglm')) return 'autoglm';
  if (lower.includes('qwen')) return 'qwenvl';
  if (lower.includes('uitars') || lower.includes('tars')) return 'uitars';
  if (lower.includes('maiui') || lower.includes('mai')) return 'maiui';
  if (lower.includes('guiowl') || lower.includes('gui')) return 'guiowl';
  return 'autoglm';
}

export class VlmClient {
  private apiUrl: string;
  private modelName: string;
  private modelType: ModelType;

  constructor(apiUrl?: string, modelName?: string) {
    this.apiUrl = apiUrl || config.VLM_API_URL;
    this.modelName = modelName || config.VLM_MODEL_NAME;
    this.modelType = detectModelType(this.modelName);
  }

  getModelType(): ModelType {
    return this.modelType;
  }

  getModelName(): string {
    return this.modelName;
  }

  async executeStep(request: VLMRequest): Promise<VLMResponse> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: request.task,
        screenshot: request.screenshot,
        history: request.history,
        current_app: request.currentApp,
        lang: request.lang,
        step_number: request.stepNumber,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`VLM Bridge error ${response.status}: ${text}`);
    }

    const data = await response.json();
    return {
      action: data.action as VLMAction,
      thinking: data.thinking || '',
      finished: data.finished || false,
      rawContent: data.raw_content || '',
    };
  }
}
