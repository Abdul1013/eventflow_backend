import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '@eventflow/ui';
import { useAuth } from '@/contexts/AuthContext';
import { loginSchema, type LoginInput } from '@eventflow/validators';

const inputCls = (hasError?: boolean) =>
  `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors
   focus:ring-2 focus:ring-primary/40 ${
     hasError ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white hover:border-gray-400'
   }`;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;
  const verified = new URLSearchParams(location.search).get('verified') === 'true';

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      await login(data.email, data.password);
      navigate('/', { replace: true });
    } catch {
      setServerError('Invalid email or password. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2.5 mb-5">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="36" height="36" rx="9" fill="#4F46E5" />
                <path d="M9 11h12M9 18h8M9 25h12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="26" cy="23" r="6" fill="#06B6D4" />
                <path d="M23.5 23l2 2 3-3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-2xl font-bold text-gray-900 tracking-tight">EventFlow</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-800">Admin Sign In</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your admin account</p>
          </div>

          {verified && (
            <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Email verified — you can now log in.
            </div>
          )}

          {flash && (
            <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {flash}
            </div>
          )}

          {serverError && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={inputCls(!!errors.email)}
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className={inputCls(!!errors.password)}
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>
            <Link
                  to="/forgot-password"
                  className="text-xs text-primary hover:text-primary-dark hover:underline"
                >
                  Forgot password?
                </Link>

            <Button type="submit" isLoading={isSubmitting} className="w-full mt-2">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
