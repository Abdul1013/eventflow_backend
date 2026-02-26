import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@eventflow/ui';
import { api } from '@/lib/api';
import { registerFormSchema, type RegisterFormValues } from '@eventflow/validators';

const inputCls = (hasError?: boolean) =>
  `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors
   focus:ring-2 focus:ring-primary/40 ${
     hasError ? 'border-red-400 bg-red-50' : 'border-gray-300 hover:border-gray-400'
   }`;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });

  const onSubmit = async (data: RegisterFormValues) => {
    setServerError(null);
    try {
      await api.post('/auth/register', {
        name: data.name,
        email: data.email,
        password: data.password,
      });
      navigate('/login', {
        state: { flash: 'Account created — check your email to verify, then sign in.' },
        replace: true,
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: { data?: { error?: { code?: string } } } }).response?.data
          ?.error?.code === 'string' &&
        (err as { response: { data: { error: { code: string } } } }).response.data.error.code ===
          'EMAIL_TAKEN'
      ) {
        setServerError('That email is already registered. Try signing in instead.');
      } else {
        setServerError('Something went wrong. Please try again.');
      }
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
            <h1 className="text-xl font-semibold text-gray-800">Create account</h1>
            <p className="mt-1 text-sm text-gray-500">EventFlow admin registration</p>
          </div>

          {serverError && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                className={inputCls(!!errors.name)}
                {...register('name')}
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>

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
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                className={inputCls(!!errors.password)}
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                className={inputCls(!!errors.confirmPassword)}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" isLoading={isSubmitting} className="w-full mt-2">
              Create account
            </Button>

            <p className="text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
