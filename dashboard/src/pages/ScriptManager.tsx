import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  FileCode2, Plus, Trash2, CheckCircle2, XCircle, Clock, Download,
  Loader2, Code2, X, Search, ShieldCheck, Play
} from 'lucide-react';

function highlightJS(code: string): string {
  const keywords = /\b(import|export|const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|try|catch|finally|throw|async|await|class|extends|this|super|typeof|instanceof|void|delete|in|of|default|from|as|true|false|null|undefined|yield|static|get|set)\b/g;
  const strings = /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/g;
  const comments = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
  const numbers = /\b(\d+\.?\d*)\b/g;
  const methods = /\.(\w+)(?=\s*[\(\.])/g;
  const builtins = /\b(console|Math|JSON|Date|RegExp|Array|Object|String|Number|Boolean|parseInt|parseFloat|setTimeout|setInterval|Promise|Error|Map|Set|Symbol|Proxy|Reflect)\b/g;

  const tokens: { idx: number; end: number; html: string }[] = [];

  const addMatches = (pattern: RegExp, cls: string) => {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(code)) !== null) {
      tokens.push({ idx: m.index, end: m.index + m[0].length, html: `<span class="${cls}">${esc(m[0])}</span>` });
    }
  };

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  addMatches(comments, 'text-gray-400 italic');
  addMatches(strings, 'text-emerald-600');
  addMatches(keywords, 'text-purple-600 font-semibold');
  addMatches(builtins, 'text-blue-600');
  addMatches(methods, 'text-amber-600');
  addMatches(numbers, 'text-orange-500');

  tokens.sort((a, b) => a.idx - b.idx);

  let out = '';
  let pos = 0;
  for (const t of tokens) {
    if (t.idx < pos) continue;
    out += esc(code.slice(pos, t.idx)) + t.html;
    pos = t.end;
  }
  out += esc(code.slice(pos));
  return out;
}

const PLATFORM_NAMES: Record<string, string> = {
  dy: '抖音', ks: '快手', wx: '微信', xhs: '小红书',
};

const PLATFORM_COLORS: Record<string, string> = {
  dy: 'bg-pink-100 text-pink-700',
  ks: 'bg-orange-100 text-orange-700',
  wx: 'bg-green-100 text-green-700',
  xhs: 'bg-red-100 text-red-700',
};

const VALIDATION_STYLES: Record<string, { bg: string; text: string; icon: React.ComponentType<{ size?: number }>; label: string }> = {
  untested: { bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock, label: '未验证' },
  passed: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2, label: '验证通过' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: '验证失败' },
};

export default function ScriptManager() {
  const navigate = useNavigate();
  const scripts = useStore(s => s.scripts);
  const scriptsLoading = useStore(s => s.scriptsLoading);
  const loadScripts = useStore(s => s.loadScripts);

  const [showSource, setShowSource] = useState<string | null>(null);
  const [sourceCode, setSourceCode] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  const handleViewSource = useCallback(async (id: string) => {
    setShowSource(id);
    setSourceLoading(true);
    setSourceCode('');
    try {
      const result = await api.vlmGetScript(id);
      setSourceCode(result.sourceCode || result.source || '// 无法加载源代码');
    } catch {
      setSourceCode('// 加载源代码失败');
    } finally {
      setSourceLoading(false);
    }
  }, []);

  const handleValidate = useCallback(async (id: string) => {
    setValidatingId(id);
    try {
      await api.vlmValidateScript(id);
      await loadScripts();
    } catch (err: any) {
      toast('error', `验证失败: ${err.message}`);
    } finally {
      setValidatingId(null);
    }
  }, [loadScripts]);

  const handleDownload = useCallback(async (id: string) => {
    try {
      const result = await api.vlmDownloadScript(id);
      const blob = new Blob([result.sourceCode || result.source || '// empty'], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `script-${id.slice(0, 8)}.js`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast('error', `下载失败: ${err.message}`);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await api.vlmDeleteScript(id);
      setShowDeleteConfirm(null);
      await loadScripts();
    } catch (err: any) {
      toast('error', `删除失败: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }, [loadScripts]);

  const filteredScripts = scripts.filter(s => {
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (platformFilter && s.platform !== platformFilter) return false;
    return true;
  });

  const platformList = [...new Set(scripts.map(s => s.platform))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <FileCode2 size={24} className="text-purple-600" />
          编译脚本管理
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/vlm/episodes')}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            从 Episode 新建
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索脚本名称..."
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 w-48"
          />
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="">全部平台</option>
            {platformList.map(p => (
              <option key={p} value={p}>{PLATFORM_NAMES[p] || p}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">共 {filteredScripts.length} 个脚本</span>
        </div>
      </div>

      {/* Script Grid */}
      {scriptsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-purple-500" />
        </div>
      ) : filteredScripts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FileCode2 size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-lg">暂无编译脚本</p>
          <p className="text-sm mt-1">从已完成的 Episode 编译脚本后，将在此显示</p>
          <button
            onClick={() => navigate('/vlm/episodes')}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={16} />
            查看 Episodes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredScripts.map(script => {
            const validationInfo = VALIDATION_STYLES[script.validationStatus] || VALIDATION_STYLES.untested;
            const ValidationIcon = validationInfo.icon;

            return (
              <div
                key={script.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-purple-300 hover:shadow-sm transition-all group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{script.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${PLATFORM_COLORS[script.platform] || 'bg-gray-100 text-gray-600'}`}>
                        {PLATFORM_NAMES[script.platform] || script.platform}
                      </span>
                      <span className="text-xs text-gray-400">
                        {script.selectorCount || 0} 选择器
                      </span>
                    </div>
                  </div>
                </div>

                {/* Validation status */}
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${validationInfo.bg} ${validationInfo.text}`}>
                  <ValidationIcon size={12} />
                  {validationInfo.label}
                </div>

                {/* Episode source */}
                {script.episodeName && (
                  <p className="text-xs text-gray-400 mt-2 truncate">
                    来源: {script.episodeName}
                  </p>
                )}

                {/* Created date */}
                <p className="text-xs text-gray-400 mt-1">
                  创建: {new Date(script.createdAt).toLocaleDateString('zh-CN')}
                </p>

                {/* Action buttons */}
                <div className="flex items-center gap-1 mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleViewSource(script.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="查看源码"
                  >
                    <Code2 size={14} />
                    源码
                  </button>
                  <button
                    onClick={() => handleValidate(script.id)}
                    disabled={validatingId === script.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                    title="验证脚本"
                  >
                    {validatingId === script.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={14} />
                    )}
                    验证
                  </button>
                  <button
                    onClick={() => handleDownload(script.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="下载脚本"
                  >
                    <Download size={14} />
                    下载
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(script.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-auto"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Source Code Modal */}
      {showSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSource(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <FileCode2 size={18} className="text-purple-600" />
                <h3 className="font-semibold text-gray-900">
                  {scripts.find(s => s.id === showSource)?.name || '脚本源码'}
                </h3>
              </div>
              <button
                onClick={() => setShowSource(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-0 flex-1 overflow-hidden">
              {sourceLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={24} className="animate-spin text-purple-500" />
                </div>
              ) : (
                <pre
                  className="text-xs font-mono p-4 overflow-auto max-h-[55vh] whitespace-pre-wrap bg-gray-900 text-gray-100"
                  dangerouslySetInnerHTML={{ __html: highlightJS(sourceCode) }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm !== null}
        title="确认删除"
        message="确定要删除此脚本吗？此操作不可撤销。"
        confirmLabel="删除"
        variant="danger"
        loading={deletingId === showDeleteConfirm}
        onConfirm={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />
    </div>
  );
}
