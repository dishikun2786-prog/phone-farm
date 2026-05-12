export { VlmClient, detectModelType } from './vlm-client';
export type { VLMAction, VLMResponse, VLMRequest, VLMScreenshot, ModelType } from './vlm-client';
export { parseAction } from './action-parser';
export type { ParseResult } from './action-parser';
export { VlmOrchestrator } from './vlm-orchestrator';
export type { VlmTaskConfig, StepResult, VlmTaskResult } from './vlm-orchestrator';
export { EpisodeRecorder, FileSystemEpisodeStore } from './episode-recorder';
export type { EpisodeMeta, EpisodeStep, EpisodeData, EpisodeSummary, EpisodeStore } from './episode-recorder';
export { compileEpisode, scoreSelectorStability } from './script-compiler';
export type { CompiledScript, NodeSelector } from './script-compiler';
export { registerVlmRoutes, commandFromAction } from './vlm-routes';
export type { WsHubLike } from './vlm-routes';
export { ScreenshotStore } from './screenshot-store';
export type { ScreenshotEntry } from './screenshot-store';
export { mergeEpisodes } from './episode-merger';
export type { MergeInput, MergeResult, StepConsensus } from './episode-merger';
export {
  runABTest,
  computeMetrics,
  compareModels,
  estimateCost,
  estimateStepCost,
  buildComparison,
  formatComparisonReport,
  DEFAULT_PRICING,
  DEFAULT_AB_MODELS,
} from './model-ab';
export type {
  ABModelConfig,
  ModelPricing,
  ModelUnderTest,
  ModelMetrics,
  ModelComparison,
  ABTestResult,
  ABStep,
  ABModelMetrics,
  ABComparisonResult,
} from './model-ab';
export { registerVlmModelRoutes, DEFAULT_MODEL_SEEDS } from './vlm-model-routes';
export type { VlmModelConfig, ABTestRun } from './vlm-model-routes';
