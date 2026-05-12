import { Wifi, Bot, Brain, Camera, Video, ListTodo, Layout, Server, Shield, ToggleLeft, CreditCard, Smartphone, Bell, Monitor, Cpu } from 'lucide-react';

const ICON_MAP: Record<string, typeof Wifi> = {
  Wifi, Bot, Brain, Camera, Video, ListTodo, Layout, Server, Shield, Toggle: ToggleLeft, CreditCard, Smartphone, Bell, Monitor, Cpu,
};

export function getCategoryIcon(iconName: string) {
  return ICON_MAP[iconName] || Server;
}

/**
 * Dynamic form field component that renders the appropriate input
 * based on the config definition's valueType.
 */
import { useState, useEffect } from 'react';

export interface ConfigDefinition {
  id: string;
  categoryId: string;
  key: string;
  displayName: string;
  description?: string;
  valueType: 'string' | 'number' | 'boolean' | 'json' | 'enum' | 'slider' | 'color' | 'url' | 'secret';
  defaultValue?: string;
  enumOptions?: { label: string; value: string }[];
  validationRule?: { min?: number; max?: number; step?: number; pattern?: string; required?: boolean };
  isSecret: boolean;
  isOverridable: boolean;
  allowedScopes: string[];
  tags: string[];
  sortOrder: number;
}

interface Props {
  definition: ConfigDefinition;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

export default function ConfigField({ definition, value, onChange, disabled, error }: Props) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  const baseInputClass = "w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";
  const errorClass = error ? "border-red-400 bg-red-50" : "border-gray-200 bg-white";
  const disabledClass = disabled ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "";

  switch (definition.valueType) {
    case 'boolean':
      return (
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={localValue === 'true'}
            onChange={(e) => handleChange(e.target.checked ? 'true' : 'false')}
            disabled={disabled}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
        </label>
      );

    case 'enum':
      return (
        <select
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          className={`${baseInputClass} ${disabledClass}`}
        >
          {definition.enumOptions?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );

    case 'slider':
      const min = definition.validationRule?.min ?? 0;
      const max = definition.validationRule?.max ?? 100;
      const step = definition.validationRule?.step ?? 1;
      const numVal = parseFloat(localValue) || min;
      return (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={numVal}
            onChange={(e) => handleChange(e.target.value)}
            disabled={disabled}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <span className="text-xs font-mono text-gray-600 w-14 text-right">{localValue}</span>
        </div>
      );

    case 'number':
      return (
        <input
          type="number"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          min={definition.validationRule?.min}
          max={definition.validationRule?.max}
          step={definition.validationRule?.step}
          className={`${baseInputClass} ${errorClass} ${disabledClass}`}
        />
      );

    case 'secret':
      const [revealed, setRevealed] = useState(false);
      return (
        <div className="relative">
          <input
            type={revealed ? 'text' : 'password'}
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            disabled={disabled}
            placeholder="••••••••"
            className={`${baseInputClass} ${errorClass} ${disabledClass} pr-16`}
          />
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
          >
            {revealed ? '隐藏' : '显示'}
          </button>
        </div>
      );

    case 'json':
      return (
        <textarea
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          rows={4}
          className={`${baseInputClass} ${errorClass} ${disabledClass} font-mono text-xs`}
          placeholder='{"key": "value"}'
        />
      );

    case 'color':
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={localValue.startsWith('#') ? localValue : '#000000'}
            onChange={(e) => handleChange(e.target.value)}
            disabled={disabled}
            className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
          />
          <input
            type="text"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            disabled={disabled}
            className={`${baseInputClass} ${disabledClass} flex-1`}
          />
        </div>
      );

    case 'url':
      return (
        <input
          type="url"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          placeholder="https://"
          className={`${baseInputClass} ${errorClass} ${disabledClass}`}
        />
      );

    default: // string
      return (
        <input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          className={`${baseInputClass} ${errorClass} ${disabledClass}`}
        />
      );
  }
}
