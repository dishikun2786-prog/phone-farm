import type { ReactNode } from 'react';
import { RefreshCw, AlertTriangle, Inbox, SearchX } from 'lucide-react';

interface PageWrapperProps {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  emptyIcon?: ReactNode;
  emptyResults?: boolean;
  onClearFilters?: () => void;
  children: ReactNode;
}

export default function PageWrapper({
  loading,
  error,
  empty,
  emptyTitle = '暂无数据',
  emptyDescription,
  emptyAction,
  emptyIcon,
  emptyResults,
  onClearFilters,
  children,
}: PageWrapperProps) {
  if (loading) {
    return <>{children}</>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="w-14 h-14 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <p className="text-lg text-gray-900 dark:text-slate-100 font-medium mb-1">加载失败</p>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4 max-w-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors active:scale-95"
        >
          <RefreshCw size={16} />
          重试
        </button>
      </div>
    );
  }

  if (emptyResults) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="w-14 h-14 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
          <SearchX size={28} className="text-gray-400 dark:text-slate-500" />
        </div>
        <p className="text-lg text-gray-500 dark:text-slate-400 mb-1">无匹配结果</p>
        <p className="text-sm text-gray-400 dark:text-slate-500 mb-4">尝试修改筛选条件</p>
        {onClearFilters && (
          <button
            onClick={onClearFilters}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-300 transition-colors"
          >
            清除筛选
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        {emptyIcon || (
          <div className="w-14 h-14 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
            <Inbox size={28} className="text-gray-400 dark:text-slate-500" />
          </div>
        )}
        <p className="text-lg text-gray-500 dark:text-slate-400 mb-1">{emptyTitle}</p>
        {emptyDescription && <p className="text-sm text-gray-400 dark:text-slate-500 mb-4">{emptyDescription}</p>}
        {emptyAction}
      </div>
    );
  }

  return <div className="animate-fade-in">{children}</div>;
}
