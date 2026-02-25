import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@eventflow/ui';
import { api } from '@/lib/api';

// ─── Form schema (UI only — token comes from URL query param) ─────────────────

const passwordComplexity = z
  .string()
  .min(8, 'At least 8 characters')
  .refine((p) => /[A-Z]/.test(p), 'Must contain an uppercase letter')
  .refine((p) => /[0-9]/.test(p), 'Must contain a number');

const formSchema = z
  .object({ newPassword: passwordComplexity, confirmNewPassword: z.string() })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  });

type FormValues = z.infer<typeof formSchema>;

const inputCls = (hasError?: boolean) =>
  `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors
   focus:ring-2 focus:ring-primary/40 ${
     hasError ? 'border-red-400 bg-red-50' : 'border-gray-300 hover:border-gray-400'
   }`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  // Guard: no token in URL → send to forgot-password
  useEffect(() => {
    if (!token) navigate('/forgot-password', { replace: true });
  }, [token, navigate]);

  const onSubmit = async (data: FormValues) => {
    try {
      await api.post('/auth/reset-password', { token, newPassword: data.newPassword });
      navigate('/login', {
        state: { flash: 'Password updated successfully. Please sign in.' },
        replace: true,
      });
    } catch {
      setError('root', { message: 'This reset link is invalid or has expired.' });
    }
  };

  if (isSubmitSuccessful) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Set a new password</h1>
            <p className="mt-1 text-sm text-gray-500">
              Choose a strong password for your account.
            </p>
          </div>

          {errors.root && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errors.root.message}{' '}
              <Link to="/forgot-password" className="font-medium underline">
                Request a new link
              </Link>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                className={inputCls(!!errors.newPassword)}
                {...register('newPassword')}
              />
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-400">
                Min. 8 chars, one uppercase letter and one number
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmNewPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirm new password
              </label>
              <input
                id="confirmNewPassword"
                type="password"
                autoComplete="new-password"
                className={inputCls(!!errors.confirmNewPassword)}
                {...register('confirmNewPassword')}
              />
              {errors.confirmNewPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmNewPassword.message}</p>
              )}
            </div>

            <Button type="submit" isLoading={isSubmitting} className="w-full mt-2">
              Set new password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
