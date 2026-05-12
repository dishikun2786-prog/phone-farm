import { useState, useRef, useCallback } from 'react';
import { MousePointerClick, Download, Upload, X, Plus } from 'lucide-react';
import { toast } from '../hooks/useToast';

interface KeyMapMapping {
  keyCode: string;
  keyName: string;
  action: string;
  x?: number;
  y?: number;
}

export interface KeyMapProfile {
  id: string;
  name: string;
  platform: string;
  deviceResolution: { width: number; height: number };
  mappings: KeyMapMapping[];
  createdAt: string;
}

interface KeyMapVisualizerProps {
  profile: KeyMapProfile;
  onUpdate?: (mappings: KeyMapMapping[]) => void;
  onClose?: () => void;
}

const ACTION_COLORS: Record<string, { fill: string; stroke: string }> = {
  'click': { fill: '#3b82f6', stroke: '#2563eb' },
  'doubleClick': { fill: '#8b5cf6', stroke: '#7c3aed' },
  'longPress': { fill: '#f59e0b', stroke: '#d97706' },
  'swipe': { fill: '#10b981', stroke: '#059669' },
  'input': { fill: '#ef4444', stroke: '#dc2626' },
  'back': { fill: '#6b7280', stroke: '#4b5563' },
  'home': { fill: '#6b7280', stroke: '#4b5563' },
};

const ACTION_LABELS: Record<string, string> = {
  'click': '单击',
  'doubleClick': '双击',
  'longPress': '长按',
  'swipe': '滑动',
  'input': '输入',
  'back': '返回',
  'home': '主页',
};

const SVG_WIDTH = 270;
const SVG_HEIGHT = 580;
const PHONE_RADIUS = 32;
const NOTCH_WIDTH = 100;
const NOTCH_HEIGHT = 24;
const DOT_RADIUS = 7;

function normalizeCoord(value: number | undefined, max: number, svgMax: number): number | undefined {
  if (value == null) return undefined;
  return (value / max) * svgMax;
}

export default function KeyMapVisualizer({ profile, onUpdate, onClose }: KeyMapVisualizerProps) {
  const [mappings, setMappings] = useState<KeyMapMapping[]>(profile.mappings || []);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [newMapping, setNewMapping] = useState<Partial<KeyMapMapping>>({ action: 'click', keyCode: '', keyName: '' });
  const svgRef = useRef<SVGSVGElement>(null);

  const { width: resW, height: resH } = profile.deviceResolution;

  const emitUpdate = useCallback((updated: KeyMapMapping[]) => {
    setMappings(updated);
    onUpdate?.(updated);
  }, [onUpdate]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!addMode || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const realX = Math.round((x / SVG_WIDTH) * resW);
    const realY = Math.round((y / SVG_HEIGHT) * resH);

    const mapping: KeyMapMapping = {
      keyCode: newMapping.keyCode || `key_${Date.now()}`,
      keyName: newMapping.keyName || `点${mappings.length + 1}`,
      action: newMapping.action || 'click',
      x: realX,
      y: realY,
    };

    emitUpdate([...mappings, mapping]);
    setAddMode(false);
    setNewMapping({ action: 'click', keyCode: '', keyName: '' });
  };

  const handleDotDrag = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    if (!svgRef.current) return;
    setDraggingIdx(idx);

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();

    const handleMove = (ev: MouseEvent) => {
      const x = Math.max(0, Math.min(SVG_WIDTH, ev.clientX - rect.left));
      const y = Math.max(0, Math.min(SVG_HEIGHT, ev.clientY - rect.top));

      const realX = Math.round((x / SVG_WIDTH) * resW);
      const realY = Math.round((y / SVG_HEIGHT) * resH);

      const updated = mappings.map((m, i) =>
        i === idx ? { ...m, x: realX, y: realY } : m
      );
      setMappings(updated);
    };

    const handleUp = () => {
      setDraggingIdx(null);
      onUpdate?.(mappings);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  const removeMapping = (idx: number) => {
    emitUpdate(mappings.filter((_, i) => i !== idx));
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ ...profile, mappings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('success', '键位配置已导出');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (data.mappings && Array.isArray(data.mappings)) {
            emitUpdate(data.mappings);
            toast('success', `已导入 ${data.mappings.length} 个映射`);
          }
        } catch {
          toast('error', '文件格式无效');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">键位映射编辑器</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {profile.name} · {profile.platform} · {resW}x{resH}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={14} /> 返回
            </button>
          )}
          <button
            onClick={handleImport}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
          >
            <Upload size={12} /> 导入
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
          >
            <Download size={12} /> 导出
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* SVG Phone Model */}
        <div className="shrink-0 flex flex-col items-center">
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-4">
            <svg
              ref={svgRef}
              width={SVG_WIDTH}
              height={SVG_HEIGHT}
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className={`${addMode ? 'cursor-crosshair' : 'cursor-default'}`}
              onClick={handleSvgClick}
            >
              {/* Phone body */}
              <rect
                x="0" y="0"
                width={SVG_WIDTH} height={SVG_HEIGHT}
                rx={PHONE_RADIUS} ry={PHONE_RADIUS}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="4"
              />

              {/* Screen area */}
              <rect
                x="12" y="40"
                width={SVG_WIDTH - 24} height={SVG_HEIGHT - 60}
                rx="8" ry="8"
                fill="#1e293b"
              />

              {/* Notch */}
              <rect
                x={(SVG_WIDTH - NOTCH_WIDTH) / 2} y="8"
                width={NOTCH_WIDTH} height={NOTCH_HEIGHT}
                rx="12" ry="12"
                fill="#475569"
              />

              {/* Bottom home indicator */}
              <rect
                x={(SVG_WIDTH - 60) / 2} y={SVG_HEIGHT - 20}
                width="60" height="5"
                rx="3" ry="3"
                fill="#475569"
              />

              {/* Mapped dots */}
              {mappings.map((m, idx) => {
                const sx = normalizeCoord(m.x, resW, SVG_WIDTH);
                const sy = normalizeCoord(m.y, resH, SVG_HEIGHT);
                if (sx == null || sy == null) return null;
                const colors = ACTION_COLORS[m.action] || ACTION_COLORS['click'];
                const isHovered = hoveredIdx === idx;
                const isDragging = draggingIdx === idx;

                return (
                  <g key={idx}>
                    {/* Outer ring */}
                    <circle
                      cx={sx} cy={sy}
                      r={isHovered || isDragging ? DOT_RADIUS + 4 : DOT_RADIUS + 2}
                      fill={colors.fill}
                      fillOpacity={0.2}
                      className="transition-all duration-150"
                    />
                    {/* Core dot */}
                    <circle
                      cx={sx} cy={sy}
                      r={DOT_RADIUS}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth="2"
                      className="transition-all duration-150 cursor-grab active:cursor-grabbing"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onMouseDown={(e) => handleDotDrag(e, idx)}
                    />
                    {/* Label */}
                    {(isHovered || isDragging) && (
                      <text
                        x={sx} y={sy - DOT_RADIUS - 8}
                        textAnchor="middle"
                        className="fill-slate-200 text-[10px] pointer-events-none"
                      >
                        {m.keyName || m.action}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-2">
              {addMode ? '点击屏幕区域放置新映射' : '拖拽圆点微调位置 · 悬停查看详情'}
            </p>
          </div>

          {/* Add mapping controls */}
          <div className={`mt-3 w-full space-y-2 ${addMode ? '' : 'opacity-60'}`}>
            <button
              onClick={() => setAddMode(!addMode)}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                addMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              <Plus size={14} /> {addMode ? '取消添加' : '添加映射'}
            </button>
            {addMode && (
              <div className="space-y-2 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                <input
                  type="text"
                  placeholder="键名 (如: F1, Space)"
                  value={newMapping.keyName || ''}
                  onChange={e => setNewMapping({ ...newMapping, keyName: e.target.value, keyCode: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <select
                  value={newMapping.action || 'click'}
                  onChange={e => setNewMapping({ ...newMapping, action: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {Object.entries(ACTION_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Mapping list */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2 flex items-center gap-2">
            <MousePointerClick size={14} />
            映射列表 ({mappings.length})
          </h4>
          {mappings.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-8 text-center">
              暂无映射，点击"添加映射"后在手机模型上点击
            </p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {mappings.map((m, idx) => {
                const colors = ACTION_COLORS[m.action] || ACTION_COLORS['click'];
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600 transition-colors group"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: colors.fill, border: `2px solid ${colors.stroke}` }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
                          {m.keyName || `映射 ${idx + 1}`}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400">
                          {ACTION_LABELS[m.action] || m.action}
                        </span>
                      </div>
                      {(m.x != null && m.y != null) && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 font-mono">
                          ({m.x}, {m.y})
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 font-mono shrink-0">
                      {m.keyCode}
                    </div>
                    <button
                      onClick={() => removeMapping(idx)}
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
