import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { EventDetail } from '@eventflow/types';
import { api } from '@/lib/api';
import { EventFormFields } from '@/components/events/EventFormFields';
import type { FieldValues } from 'react-hook-form';

// ─── Schema ───────────────────────────────────────────────────────────────────

const editEventSchema = z.object({
  title: z.string().min(3, 'At least 3 characters').max(200),
  description: z.string().min(10, 'At least 10 characters'),
  venueId: z.string().min(1, 'Please select a venue'),
  startsAt: z.string().min(1, 'Start date required'),
  endsAt: z.string().min(1, 'End date required'),
});

type EditFormData = z.infer<typeof editEventSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ApiResp<T> = { success: boolean; data: T };

/** Convert ISO string → datetime-local value (no seconds, no tz) */
function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractApiError(err: unknown): string | null {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response: { data: { error?: { message: string } } } }).response;
    return resp?.data?.error?.message ?? null;
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: event, isLoading, isError } = useQuery({
    queryKey: ['event', id],
    queryFn: () =>
      api.get<ApiResp<EventDetail>>(`/events/${id!}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditFormData>({
    resolver: zodResolver(editEventSchema),
  });

  // Pre-populate form once event data arrives
  useEffect(() => {
    if (event) {
      reset({
        title: event.title,
        description: event.description,
        venueId: event.venueId,
        startsAt: toDatetimeLocal(event.startsAt),
        endsAt: toDatetimeLocal(event.endsAt),
      });
    }
  }, [event, reset]);

  // Guard: redirect if event is not in DRAFT status
  useEffect(() => {
    if (event && event.status !== 'DRAFT') {
      navigate(`/events/${id!}`, { replace: true });
    }
  }, [event, id, navigate]);

  const { mutate: updateEvent, isPending, error: submitError } = useMutation({
    mutationFn: (data: EditFormData) =>
      api.patch(`/events/${id!}`, {
        ...data,
        startsAt: new Date(data.startsAt).toISOString(),
        endsAt: new Date(data.endsAt).toISOString(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['event', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      navigate(`/events/${id!}`);
    },
  });

  const apiError = extractApiError(submitError);

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4 animate-pulse">
        <div className="h-6 w-40 bg-gray-200 rounded" />
        <div className="h-8 w-64 bg-gray-200 rounded" />
        <div className="h-48 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="p-6">
        <p className="text-red-600 text-sm">Failed to load event.</p>
        <button
          onClick={() => navigate('/events')}
          className="mt-2 text-indigo-600 hover:underline text-sm"
        >
          Back to Events
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate(`/events/${id!}`)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={14} />
        Back to Event
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Edit Event</h1>
      <p className="text-sm text-gray-500 mb-8">
        Only <strong>draft</strong> events can be edited.
      </p>

      <form
        onSubmit={handleSubmit((d) => updateEvent(d))}
        className="bg-white border border-gray-200 rounded-xl p-6 space-y-6"
      >
        <EventFormFields
          step={1}
          control={control as unknown as import('react-hook-form').Control<FieldValues>}
          register={register as unknown as import('react-hook-form').UseFormRegister<FieldValues>}
          errors={errors}
        />

        {apiError && (
          <p className="text-red-600 text-sm border border-red-200 bg-red-50 rounded-lg px-4 py-2">
            {apiError}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(`/events/${id!}`)}
            className="px-5 py-2 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !isDirty}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
