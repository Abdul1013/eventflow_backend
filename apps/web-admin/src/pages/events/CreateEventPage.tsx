import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Upload, X, Calendar } from 'lucide-react';
import { StepIndicator } from '@eventflow/ui';
import {
  EventFormFields,
  eventFormSchema,
  type EventFormData,
} from '@/components/events/EventFormFields';
import { api } from '@/lib/api';

//  Constant
const STEPS = ['Basic Info', 'Ticket Types', 'Review'];

const STEP_FIELDS: Record<number, (keyof EventFormData)[]> = {
  0: ['title', 'description', 'venueId', 'startsAt', 'endsAt'],
  1: ['ticketTypes'],
};

//  Helpers

function fmtLocal(iso: string) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function extractApiError(err: unknown): string | null {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (
      err as {
        response: {
          data: { error?: { message: string; details?: Record<string, string[]> } };
        };
      }
    ).response;
    const error = resp?.data?.error;
    if (!error) return null;
    if (error.details) {
      const fieldErrors = Object.entries(error.details)
        .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
        .join(' | ');
      return `${error.message} — ${fieldErrors}`;
    }
    return error.message ?? null;
  }
  return null;
}

//  Component

export default function CreateEventPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    control,
    handleSubmit,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: '',
      description: '',
      venueId: '',
      startsAt: '',
      endsAt: '',
      ticketTypes: [{ name: '', price: 0, quantityTotal: 100, description: '' }],
    },
  });

  async function handleNext() {
    const fields = STEP_FIELDS[step];
    const valid = await trigger(fields);
    if (valid) setStep((s) => s + 1);
  }

  function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  }

  function removeBanner() {
    setBannerFile(null);
    setBannerPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const {
    mutate: createEvent,
    isPending,
    error: submitError,
  } = useMutation({
    mutationFn: async (data: EventFormData) => {
      type CreateResp = { success: boolean; data: { id: string } };
      const resp = await api.post<CreateResp>('/events', {
        ...data,
        startsAt: new Date(data.startsAt).toISOString(),
        endsAt: new Date(data.endsAt).toISOString(),
      });
      const eventId = resp.data.data.id;

      if (bannerFile) {
        const form = new FormData();
        form.append('image', bannerFile);
        await api.post(`/events/${eventId}/banner`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      return eventId;
    },
    onSuccess: (eventId) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      navigate(`/events/${eventId}`);
    },
  });

  const apiError = extractApiError(submitError);
  const values = getValues();

  return (
    <div className="p-6 align-center justify-center flex flex-1 flex-col max-w-4xl mx-auto">
      {/* Back */}
      <div className="mb-6 border-b border-gray-200 pb-4 flex items-center ">
        <button
          onClick={() => navigate('/events')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft size={14} />
          Back to Events
        </button>

        <h1 className="text-2xl ml-60 font-bold text-gray-900 mb-8">Create Event</h1>
      </div>
      {/* Step indicator */}
      <div className="mb-8">
        <StepIndicator steps={STEPS} currentStep={step} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        {/* ── Step 0: Basic info ── */}
        {step === 0 && (
          <EventFormFields step={1} control={control} register={register} errors={errors} />
        )}

        {/* ── Step 1: Ticket types ── */}
        {step === 1 && (
          <EventFormFields step={2} control={control} register={register} errors={errors} />
        )}

        {/* ── Step 2: Banner + review ── */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Banner upload */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Event Banner (Optional)
              </h2>
              {bannerPreview ? (
                <div className="relative">
                  <img
                    src={bannerPreview}
                    alt="Banner preview"
                    className="w-full h-40 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={removeBanner}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                    aria-label="Remove banner"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  <Upload size={20} />
                  <span className="text-sm">Click to upload a banner image</span>
                  <span className="text-xs">PNG, JPG up to 5 MB</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerChange}
              />
            </div>

            {/* Review summary */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Review
              </h2>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm text-gray-700">
                <div className="flex gap-2">
                  <Calendar size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  <div>
                    <p className="font-medium">{values.title}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {values.description?.slice(0, 80)}
                      {(values.description?.length ?? 0) > 80 ? '…' : ''}
                    </p>
                  </div>
                </div>
                <div className="pl-5 space-y-1 text-xs text-gray-600">
                  <p>
                    <span className="font-medium">Starts:</span> {fmtLocal(values.startsAt)}
                  </p>
                  <p>
                    <span className="font-medium">Ends:</span> {fmtLocal(values.endsAt)}
                  </p>
                  <p>
                    <span className="font-medium">Ticket types:</span>{' '}
                    {values.ticketTypes?.length ?? 0} type(s)
                    {values.ticketTypes?.length
                      ? ` — ${values.ticketTypes.map((tt) => tt.name || 'Unnamed').join(', ')}`
                      : ''}
                  </p>
                </div>
              </div>
            </div>

            {apiError && (
              <p className="text-red-600 text-sm border border-red-200 bg-red-50 rounded-lg px-4 py-2">
                {apiError}
              </p>
            )}
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="mt-8 flex justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              <ArrowLeft size={14} />
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/events')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          )}

          {step < 2 ? (
            <button
              type="button"
              onClick={() => void handleNext()}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
            >
              Next
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleSubmit((d) => createEvent(d))()}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60"
            >
              {isPending ? 'Creating…' : 'Create Event'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
