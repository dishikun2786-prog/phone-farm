import { useMemo } from 'react';

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="aspect-[9/16] bg-gray-200" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between animate-pulse">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-5 bg-gray-200 rounded w-32" />
          <div className="h-4 bg-gray-100 rounded w-12" />
          <div className="h-4 bg-gray-100 rounded w-16" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-48" />
      </div>
      <div className="flex items-center gap-1">
        <div className="h-8 w-8 bg-gray-100 rounded-lg" />
        <div className="h-8 w-8 bg-gray-100 rounded-lg" />
        <div className="h-8 w-8 bg-gray-100 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="p-4 border-b border-gray-100">
        <div className="h-4 bg-gray-200 rounded w-1/4" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="p-4 border-b border-gray-50 flex items-center gap-4">
          <div className="h-4 bg-gray-100 rounded w-24" />
          <div className="h-4 bg-gray-100 rounded w-16" />
          <div className="h-4 bg-gray-100 rounded w-20" />
          <div className="h-4 bg-gray-100 rounded w-32" />
          <div className="h-4 bg-gray-100 rounded w-12 ml-auto" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonText({ lines = 1, widths }: { lines?: number; widths?: string[] }) {
  const deterministicWidths = useMemo(() =>
    Array.from({ length: lines }).map((_, i) => widths?.[i] || `${60 + ((i * 17) % 40)}%`),
    [lines, widths]
  );

  return (
    <div className="space-y-2 animate-pulse">
      {deterministicWidths.map((w, i) => (
        <div
          key={i}
          className="h-3 bg-gray-200 rounded"
          style={{ width: w }}
        />
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
