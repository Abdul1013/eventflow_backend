import type { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string | undefined;
  trend?: string;
  isLoading?: boolean;
}

export function StatCard({ icon: Icon, label, value, trend, isLoading = false }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
          <Icon size={20} />
        </div>

        <div className="min-w-0">
          <p className="text-sm text-gray-500">{label}</p>

          {isLoading ? (
            <div className="mt-1 h-9 w-24 animate-pulse rounded bg-gray-200" />
          ) : (
            <p className="text-3xl font-bold text-gray-900 leading-tight">
              {value ?? '—'}
            </p>
          )}

          {trend && !isLoading && (
            <p className="text-xs text-emerald-500 mt-0.5">{trend}</p>
          )}
        </div>
      </div>
    </div>
  );
}
