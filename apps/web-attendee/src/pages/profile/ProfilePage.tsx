import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xl font-bold">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Details */}
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Name</dt>
            <dd className="font-medium text-gray-900">{user?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Email</dt>
            <dd className="font-medium text-gray-900">{user?.email ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Role</dt>
            <dd className="font-medium text-gray-900 capitalize">
              {user?.role.toLowerCase() ?? '—'}
            </dd>
          </div>
        </dl>

        <hr className="border-gray-100" />

        <Link
          to="/my-tickets"
          className="block text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          View my tickets →
        </Link>
      </div>
    </div>
  );
}
