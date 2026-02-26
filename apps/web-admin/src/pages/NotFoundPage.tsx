import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-gray-900">404</h1>
      <p className="text-gray-500">Page not found</p>
      <Link to="/" className="text-primary underline">
        Back to dashboard
      </Link>
    </div>
  );
}
