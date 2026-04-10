import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, MapPin, Pencil } from 'lucide-react';
import type { VenueSummary } from '@eventflow/types';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';

type ApiResp<T> = { success: boolean; data: T };

export default function VenuesPage() {
  const { data: venues, isLoading, isError, refetch } = useQuery({
    queryKey: ['venues'],
    queryFn: () =>
      api.get<ApiResp<VenueSummary[]>>('/venues').then((r) => r.data.data),
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Venues"
        subtitle="Manage your event venues and seating layouts"
        actions={
          <Link
            to="/venues/new"
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} />
            New Venue
          </Link>
        }
      />

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between text-sm text-red-700">
          <span>Failed to load venues.</span>
          <button onClick={() => void refetch()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Name', 'City', 'Address', 'Capacity', 'Created', ''].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              : (venues ?? []).map((venue) => (
                  <tr key={venue.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-gray-400 shrink-0" />
                        {venue.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{venue.city}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                      {venue.address}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {venue.totalCapacity.toLocaleString()} seats
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(venue.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/venues/${venue.id}/edit`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        <Pencil size={13} />
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}

            {!isLoading && (venues ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <MapPin size={28} className="mx-auto mb-2 text-gray-300" />
                  <p>No venues yet.</p>
                  <Link
                    to="/venues/new"
                    className="mt-1 inline-block text-indigo-600 hover:underline text-sm"
                  >
                    Create the first one
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
