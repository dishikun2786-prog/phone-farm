import { X } from 'lucide-react';

export interface FilterOption {
  key: string;
  label: string;
}

interface FilterBarProps {
  options: FilterOption[];
  value: string;
  onChange: (key: string) => void;
  label?: string;
}

export default function FilterBar({ options, value, onChange, label }: FilterBarProps) {
  if (options.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-xs text-gray-400 mr-1">{label}</span>}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        {options.map(opt => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key === value ? '' : opt.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1 ${
              value === opt.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {opt.label}
            {value === opt.key && <X size={10} />}
          </button>
        ))}
      </div>
    </div>
  );
}
