interface ConfigDiffViewerProps {
  oldValue: string | null;
  newValue: string | null;
  isSecret?: boolean;
}

function maskSecret(val: string | null, isSecret: boolean): string {
  if (!val) return '(空)';
  if (isSecret) return '********';
  return val;
}

export default function ConfigDiffViewer({ oldValue, newValue, isSecret = false }: ConfigDiffViewerProps) {
  const oldDisplay = maskSecret(oldValue, isSecret);
  const newDisplay = maskSecret(newValue, isSecret);

  if (oldValue === newValue) {
    return (
      <div className="text-xs text-gray-500 dark:text-slate-400 p-2 bg-gray-50 dark:bg-slate-800 rounded">
        {oldDisplay} <span className="text-gray-400">(无变化)</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider">旧值</p>
        <div className="text-xs p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-mono break-all border border-red-200 dark:border-red-900/30">
          {oldDisplay}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider">新值</p>
        <div className="text-xs p-2 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-mono break-all border border-green-200 dark:border-green-900/30">
          {newDisplay}
        </div>
      </div>
    </div>
  );
}
