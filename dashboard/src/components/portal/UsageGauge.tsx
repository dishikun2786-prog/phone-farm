interface UsageGaugeProps {
  label: string;
  used: number;
  limit: number;
  unit?: string;
}

export default function UsageGauge({ label, used, limit, unit = '' }: UsageGaugeProps) {
  const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isWarning = percent > 80;
  const isDanger = percent > 95;

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">
          {used}{unit} / {limit}{unit}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all ${
            isDanger ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-blue-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1 text-right">
        <span className={`text-xs ${
          isDanger ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-gray-400'
        }`}>
          {percent.toFixed(0)}% 已使用
        </span>
      </div>
    </div>
  );
}
