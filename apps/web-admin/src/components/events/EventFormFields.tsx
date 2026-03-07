import { z } from 'zod';
import { useFieldArray } from 'react-hook-form';
import type { Control, UseFormRegister, FieldErrors, FieldValues } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { VenueSummary } from '@eventflow/types';
import { api } from '@/lib/api';

// ─── Schema & types (exported for use in form pages) ─────────────────────────

export const ticketTypeSchema = z.object({
  name: z.string().min(1, 'Name required'),
  price: z.coerce.number().nonnegative('Must be ≥ 0'),
  quantityTotal: z.coerce.number().int().positive('Must be > 0'),
  description: z.string().optional(),
});

export const eventFormSchema = z.object({
  title: z.string().min(3, 'At least 3 characters').max(200),
  description: z.string().min(10, 'At least 10 characters'),
  venueId: z.string().min(1, 'Please select a venue'),
  startsAt: z.string().min(1, 'Start date required'),
  endsAt: z.string().min(1, 'End date required'),
  ticketTypes: z.array(ticketTypeSchema).min(1, 'Add at least one ticket type'),
});

export type EventFormData = z.infer<typeof eventFormSchema>;

//  Props 

interface EventFormFieldsProps {
  step: 1 | 2;
  control: Control<FieldValues>;
  register: UseFormRegister<FieldValues>;
  errors: FieldErrors<FieldValues>;
}

//  Style constants 

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';
const errCls = 'text-red-500 text-xs mt-1';

//  Component 

export function EventFormFields({ step, control, register, errors }: EventFormFieldsProps) {
  type ApiResp<T> = { success: boolean; data: T };

  const { data: venues = [] } = useQuery<VenueSummary[]>({
    queryKey: ['venues'],
    queryFn: () =>
      api
        .get<ApiResp<VenueSummary[]>>('/venues')
        .then((r) => r.data.data),
    staleTime: 60_000,
  });

  const { fields, append, remove } = useFieldArray({
    control: control as Control<EventFormData>,
    name: 'ticketTypes',
  });

  //  Step 1: Basic info 

  if (step === 1) {
    return (
      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className={labelCls}>Event Title</label>
          <input
            {...register('title')}
            placeholder="e.g. Lagos Tech Summit 2026"
            className={inputCls}
          />
          {errors.title && <p className={errCls}>{String(errors.title.message)}</p>}
        </div>

        {/* Description */}
        <div>
          <label className={labelCls}>Description</label>
          <textarea
            {...register('description')}
            rows={4}
            placeholder="What's this event about?"
            className={`${inputCls} resize-none`}
          />
          {errors.description && <p className={errCls}>{String(errors.description.message)}</p>}
        </div>

        {/* Venue */}
        <div>
          <label className={labelCls}>Venue</label>
          <select {...register('venueId')} className={inputCls}>
            <option value="">Select a venue…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.city}
              </option>
            ))}
          </select>
          {errors.venueId && <p className={errCls}>{String(errors.venueId.message)}</p>}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Start Date & Time</label>
            <input type="datetime-local" {...register('startsAt')} className={inputCls} />
            {errors.startsAt && <p className={errCls}>{String(errors.startsAt.message)}</p>}
          </div>
          <div>
            <label className={labelCls}>End Date & Time</label>
            <input type="datetime-local" {...register('endsAt')} className={inputCls} />
            {errors.endsAt && <p className={errCls}>{String(errors.endsAt.message)}</p>}
          </div>
        </div>
      </div>
    );
  }

  //  Step 2: Ticket types 

  return (
    <div className="space-y-4">
      {errors.ticketTypes?.root && (
        <p className={errCls}>{String(errors.ticketTypes.root.message)}</p>
      )}

      {fields.map((field, idx) => (
        <div
          key={field.id}
          className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Ticket Type {idx + 1}</h3>
            <button
              type="button"
              onClick={() => remove(idx)}
              disabled={fields.length === 1}
              className="text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors"
              aria-label="Remove ticket type"
            >
              <Trash2 size={15} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                {...register(`ticketTypes.${idx}.name`)}
                placeholder="e.g. General Admission"
                className={inputCls}
              />
              {(errors.ticketTypes as FieldErrors<EventFormData['ticketTypes']>)?.[idx]?.name && (
                <p className={errCls}>
                  {String((errors.ticketTypes as FieldErrors<EventFormData['ticketTypes']>)[idx]?.name?.message)}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Price (₦)</label>
              <input
                {...register(`ticketTypes.${idx}.price`)}
                type="number"
                min={0}
                placeholder="0"
                className={inputCls}
              />
              {(errors.ticketTypes as FieldErrors<EventFormData['ticketTypes']>)?.[idx]?.price && (
                <p className={errCls}>
                  {String((errors.ticketTypes as FieldErrors<EventFormData['ticketTypes']>)[idx]?.price?.message)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
              <input
                {...register(`ticketTypes.${idx}.quantityTotal`)}
                type="number"
                min={1}
                placeholder="100"
                className={inputCls}
              />
              {(errors.ticketTypes as FieldErrors<EventFormData['ticketTypes']>)?.[idx]?.quantityTotal && (
                <p className={errCls}>
                  {String((errors.ticketTypes as FieldErrors<EventFormData['ticketTypes']>)[idx]?.quantityTotal?.message)}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Description (optional)
              </label>
              <input
                {...register(`ticketTypes.${idx}.description`)}
                placeholder="e.g. Includes networking lunch"
                className={inputCls}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => append({ name: '', price: 0, quantityTotal: 100, description: '' })}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
      >
        <Plus size={14} />
        Add Ticket Type
      </button>
    </div>
  );
}

  // <div>
  //         <label className={labelCls}>Venue</label>
  //         <select
  //           {...register('venueId')}
  //           className={inputCls}
  //           disabled={venuesLoading}
  //         >
  //           <option value="">
  //             {venuesLoading ? 'Loading venues…' : venuesError ? 'Failed to load venues' : 'Select a venue…'}
  //           </option>
  //           {venues.map((v) => (
  //             <option key={v.id} value={v.id}>
  //               {v.name} — {v.city}
  //             </option>
  //           ))}
  //         </select>
  //         {venuesError && (
  //           <p className={errCls}>Could not load venues. Please refresh the page.</p>
  //         )}
  //         {errors.venueId && <p className={errCls}>{String(errors.venueId.message)}</p>}
  //       </div>