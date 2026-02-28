import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { SeatMapPreview } from '@/components/SeatMapPreview';

// ─── Form schema ───────────────────────────────────────────────────────────────

const rowSchema = z.object({
  label: z.string().min(1, 'Row label required'),
  seatCount: z.coerce.number().int().min(1, 'Min 1 seat').max(100, 'Max 100 seats per row'),
});

const formSchema = z.object({
  name: z.string().min(2, 'At least 2 characters'),
  address: z.string().min(5, 'Address required'),
  city: z.string().min(2, 'City required'),
  rows: z.array(rowSchema).min(1, 'At least one row required'),
});

type FormData = z.infer<typeof formSchema>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SEAT_GAP_X = 25;
const ROW_GAP_Y = 30;
const ORIGIN_X = 30;
const ORIGIN_Y = 30;

/** Convert form rows → API layoutJson format with computed (x, y) coordinates */
function buildLayoutJson(rows: FormData['rows']) {
  return {
    rows: rows.map((row, rowIdx) => ({
      label: row.label || `Row ${rowIdx + 1}`,
      seats: Array.from({ length: Number(row.seatCount) || 0 }, (_, seatIdx) => ({
        number: String(seatIdx + 1),
        x: ORIGIN_X + seatIdx * SEAT_GAP_X,
        y: ORIGIN_Y + rowIdx * ROW_GAP_Y,
        accessible: false,
      })),
    })),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateVenuePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', address: '', city: '', rows: [{ label: 'A', seatCount: 10 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'rows' });

  // Live preview — re-computes whenever rows change
  const watchedRows = useWatch({ control, name: 'rows' });
  const previewRows = buildLayoutJson(watchedRows ?? []).rows;
  const totalSeats = previewRows.reduce((sum, r) => sum + r.seats.length, 0);

  const { mutate: submit, isPending, error: submitError } = useMutation({
    mutationFn: (data: FormData) => {
      const layoutJson = buildLayoutJson(data.rows);
      return api.post('/venues', {
        name: data.name,
        address: data.address,
        city: data.city,
        totalCapacity: totalSeats,
        layoutJson,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['venues'] });
      navigate('/venues');
    },
  });

  const apiError =
    submitError && 'response' in (submitError as object)
      ? (submitError as { response: { data: { error: { message: string } } } }).response.data.error
          .message
      : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back link */}
      <button
        onClick={() => navigate('/venues')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={14} />
        Back to Venues
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-8">New Venue</h1>

      <form onSubmit={handleSubmit((d) => submit(d))} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ── Left: Form fields ── */}
          <div className="space-y-6">
            {/* Venue details */}
            <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Venue Details
              </h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Venue Name
                </label>
                <input
                  {...register('name')}
                  placeholder="e.g. Tafawa Balewa Square"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.name && (
                  <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  {...register('address')}
                  placeholder="e.g. Addis Ababa Street, Lagos Island"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.address && (
                  <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  {...register('city')}
                  placeholder="e.g. Lagos"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.city && (
                  <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>
                )}
              </div>
            </section>

            {/* Rows */}
            <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Seating Rows
                </h2>
                <span className="text-xs text-gray-400">{totalSeats} seats total</span>
              </div>

              {errors.rows?.root && (
                <p className="text-red-500 text-xs">{errors.rows.root.message}</p>
              )}

              <div className="space-y-3">
                {fields.map((field, idx) => (
                  <div key={field.id} className="flex items-start gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Row Label</label>
                      <input
                        {...register(`rows.${idx}.label`)}
                        placeholder="A"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {errors.rows?.[idx]?.label && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.rows[idx]?.label?.message}
                        </p>
                      )}
                    </div>

                    <div className="w-28">
                      <label className="block text-xs text-gray-500 mb-1">Seats</label>
                      <input
                        {...register(`rows.${idx}.seatCount`)}
                        type="number"
                        min={1}
                        max={100}
                        placeholder="10"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {errors.rows?.[idx]?.seatCount && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.rows[idx]?.seatCount?.message}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      disabled={fields.length === 1}
                      className="mt-6 p-2 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                      aria-label="Remove row"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => append({ label: String.fromCharCode(65 + fields.length), seatCount: 10 })}
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <Plus size={14} />
                Add Row
              </button>
            </section>
          </div>

          {/* ── Right: Live preview ── */}
          <div className="space-y-4">
            <section className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                Seat Map Preview
              </h2>
              <SeatMapPreview rows={previewRows} />
              <p className="text-xs text-gray-400 mt-3 text-center">
                Blue circles = accessible seats (editable post-creation)
              </p>
            </section>
          </div>
        </div>

        {/* Submit */}
        {apiError && (
          <p className="text-red-600 text-sm border border-red-200 bg-red-50 rounded-lg px-4 py-2">
            {apiError}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/venues')}
            className="px-5 py-2 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Creating…' : 'Create Venue'}
          </button>
        </div>
      </form>
    </div>
  );
}
