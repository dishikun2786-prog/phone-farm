import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, Pause, ChevronLeft, ChevronRight,
  Zap, MousePointer2, ArrowUp, ArrowDown, ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon, Home, Search, MessageCircle,
  Heart, UserPlus, Send
} from 'lucide-react';

export interface EpisodeStep {
  stepNumber: number;
  screenshotBase64: string;
  action: string;
  thinking: string;
  modelOutput: string;
  durationMs: number;
}

interface EpisodePlayerProps {
  steps: EpisodeStep[];
}

const ACTION_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  tap: MousePointer2,
  click: MousePointer2,
  swipe_up: ArrowUp,
  swipe_down: ArrowDown,
  swipe_left: ArrowLeftIcon,
  swipe_right: ArrowRightIcon,
  back: ArrowLeftIcon,
  home: Home,
  search: Search,
  comment: MessageCircle,
  like: Heart,
  follow: UserPlus,
  send: Send,
  type: Send,
  launch: Zap,
};

const ACTION_LABELS: Record<string, string> = {
  tap: '点击',
  click: '点击',
  long_press: '长按',
  swipe_up: '上滑',
  swipe_down: '下滑',
  swipe_left: '左滑',
  swipe_right: '右滑',
  back: '返回',
  home: '主页',
  search: '搜索',
  comment: '评论',
  like: '点赞',
  follow: '关注',
  send: '发送',
  type: '输入',
  launch: '启动',
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

function getActionIcon(action: string) {
  return ACTION_ICONS[action] || MousePointer2;
}

export default function EpisodePlayer({ steps }: EpisodePlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const autoPlayTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSteps = steps.length;
  const currentStep = steps[currentIndex];

  // Auto-play logic
  useEffect(() => {
    if (autoPlay) {
      autoPlayTimer.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= totalSteps - 1) {
            setAutoPlay(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    }
    return () => {
      if (autoPlayTimer.current) clearInterval(autoPlayTimer.current);
    };
  }, [autoPlay, totalSteps]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex(prev => Math.min(totalSteps - 1, prev + 1));
      } else if (e.key === ' ') {
        e.preventDefault();
        setAutoPlay(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalSteps]);

  const goTo = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(totalSteps - 1, index)));
  }, [totalSteps]);

  const goNext = useCallback(() => {
    setCurrentIndex(prev => Math.min(totalSteps - 1, prev + 1));
  }, [totalSteps]);

  const goPrev = useCallback(() => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlay(prev => !prev);
  }, []);

  if (!steps || steps.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg">暂无步骤数据</p>
        <p className="text-sm mt-1">此 Episode 没有记录任何操作步骤。</p>
      </div>
    );
  }

  const ActionIcon = getActionIcon(currentStep?.action || '');

  return (
    <div className="space-y-4">
      {/* Main player area */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
          {/* Screenshot area */}
          <div className="lg:col-span-2 bg-black relative flex items-center justify-center min-h-96">
            {currentStep?.screenshotBase64 ? (
              <div className="relative">
                <img
                  src={`data:image/jpeg;base64,${currentStep.screenshotBase64}`}
                  alt={`Step ${currentStep.stepNumber}`}
                  className="max-w-full max-h-[600px] object-contain"
                />
                {/* Action overlay */}
                {overlayVisible && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative">
                      {/* Action indicator */}
                      <div className="absolute top-4 right-4 bg-black/60 text-white rounded-lg px-3 py-1.5 text-xs font-medium backdrop-blur-sm flex items-center gap-1.5">
                        <ActionIcon size={14} />
                        {getActionLabel(currentStep.action)}
                      </div>

                      {/* Target overlay - shows a tap circle for tap actions */}
                      {(currentStep.action === 'tap' || currentStep.action === 'click' || currentStep.action === 'long_press') && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                          <div className="w-16 h-16 rounded-full border-2 border-purple-400 bg-purple-400/20 animate-ping" />
                          <div className="w-12 h-12 rounded-full border-2 border-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                      )}

                      {/* Swipe arrow */}
                      {currentStep.action.startsWith('swipe_') && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
                          <ActionIcon size={48} className="text-purple-400 animate-bounce" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step number badge */}
                <div className="absolute top-4 left-4 bg-black/60 text-white rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                  Step {currentStep.stepNumber} / {totalSteps}
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">无截图</div>
            )}

            {/* Overlay toggle */}
            <button
              onClick={() => setOverlayVisible(v => !v)}
              className="absolute bottom-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded hover:bg-black/70 transition-colors"
            >
              {overlayVisible ? '隐藏标注' : '显示标注'}
            </button>
          </div>

          {/* Side panel: thinking + info */}
          <div className="border-l border-gray-200 p-4 space-y-3 overflow-y-auto max-h-[600px]">
            {/* Step info header */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                  步骤 {currentStep?.stepNumber}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ActionIcon size={12} />
                  {getActionLabel(currentStep?.action)}
                </span>
                {currentStep?.durationMs > 0 && (
                  <span className="text-xs text-gray-400">
                    {(currentStep.durationMs / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                {currentStep?.modelOutput || '无模型输出'}
              </p>
            </div>

            {/* VLM Thinking section */}
            <div>
              <button
                onClick={() => setShowThinking(!showThinking)}
                className="flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-800 transition-colors"
              >
                <Zap size={14} />
                VLM 思考过程
                <span className="text-gray-400 ml-1">{showThinking ? '收起' : '展开'}</span>
              </button>
              {showThinking && (
                <div className="mt-2 bg-purple-50 border border-purple-100 rounded-lg p-3">
                  <pre className="text-xs text-purple-900 whitespace-pre-wrap font-sans leading-relaxed">
                    {currentStep?.thinking || '无思考记录'}
                  </pre>
                </div>
              )}
            </div>

            {/* Keyword shortcuts hint */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">快捷键</p>
              <div className="flex gap-3 text-xs text-gray-400">
                <span><kbd className="bg-gray-100 px-1 rounded">← →</kbd> 步骤</span>
                <span><kbd className="bg-gray-100 px-1 rounded">空格</kbd> 播放/暂停</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step timeline + controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {/* Controls bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="上一步 (←)"
            >
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <button
              onClick={toggleAutoPlay}
              className={`p-2 rounded-lg transition-colors ${
                autoPlay
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
              title="播放/暂停 (空格)"
            >
              {autoPlay ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex === totalSteps - 1}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="下一步 (→)"
            >
              <ChevronRight size={20} className="text-gray-600" />
            </button>
          </div>

          <div className="text-xs text-gray-500">
            {currentIndex + 1} / {totalSteps} 步骤
            {autoPlay && <span className="text-purple-600 ml-2">自动播放中...</span>}
          </div>

          {/* Progress bar */}
          <div className="text-xs text-gray-400">
            总时长: {(steps.reduce((sum, s) => sum + (s.durationMs || 0), 0) / 1000).toFixed(1)}s
          </div>
        </div>

        {/* Step dots timeline */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-2">
          {steps.map((step, idx) => {
            const isActive = idx === currentIndex;
            const isPast = idx < currentIndex;
            const Icon = getActionIcon(step.action);
            const isError = step.action === 'error' || step.action === 'fail';

            return (
              <button
                key={step.stepNumber || idx}
                onClick={() => goTo(idx)}
                className={`flex-shrink-0 flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all min-w-14 ${
                  isActive
                    ? 'bg-purple-100 ring-2 ring-purple-400'
                    : isPast
                    ? 'bg-gray-50 hover:bg-gray-100'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
                title={`Step ${step.stepNumber}: ${getActionLabel(step.action)}`}
              >
                <Icon
                  size={16}
                  className={
                    isError ? 'text-red-500' :
                    isActive ? 'text-purple-600' :
                    isPast ? 'text-green-500' :
                    'text-gray-400'
                  }
                />
                <span className={`text-xs font-mono ${
                  isActive ? 'text-purple-700 font-semibold' :
                  isPast ? 'text-gray-500' :
                  'text-gray-400'
                }`}>
                  {step.stepNumber}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
