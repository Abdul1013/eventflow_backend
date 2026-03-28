interface SeatData {
  number: string;
  x: number;
  y: number;
  accessible: boolean;
}

interface RowData {
  label: string;
  seats: SeatData[];
}

export type SeatStatus = 'AVAILABLE' | 'ALLOCATED' | 'CHECKED_IN';

interface SeatMapPreviewProps {
  rows: RowData[];
  className?: string;
  /** Key: `${rowLabel}-${seatNumber}` → status. When provided, seats are coloured by status. */
  seatStatuses?: Record<string, SeatStatus>;
}

// ─── Status palette
const STATUS_PALETTE: Record<SeatStatus, { fill: string; stroke: string; text: string }> = {
  AVAILABLE:  { fill: '#e0e7ff', stroke: '#818cf8', text: '#4338ca' },
  ALLOCATED:  { fill: '#fef3c7', stroke: '#f59e0b', text: '#92400e' },
  CHECKED_IN: { fill: '#111827', stroke: '#374151', text: '#ffffff' },
};

// Accessible seats in AVAILABLE state get a distinct blue tint
const ACCESSIBLE_AVAILABLE = { fill: '#dbeafe', stroke: '#60a5fa', text: '#1d4ed8' };

const LEGEND_ITEMS: { status: SeatStatus; label: string }[] = [
  { status: 'AVAILABLE',  label: 'Available' },
  { status: 'ALLOCATED',  label: 'Allocated' },
  { status: 'CHECKED_IN', label: 'Checked In' },
];

// ─── Component 

export function SeatMapPreview({ rows, className, seatStatuses }: SeatMapPreviewProps) {
  const allSeats = rows.flatMap((r) => r.seats);
  const showStatus = !!seatStatuses;

  if (allSeats.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400">
        Add rows to preview the seat map
      </div>
    );
  }

  const maxX = Math.max(...allSeats.map((s) => s.x), 0);
  const maxY = Math.max(...allSeats.map((s) => s.y), 0);
  const viewW = maxX + 40;
  const viewH = maxY + 40;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="w-full max-h-72 border rounded-lg bg-gray-50"
        aria-label="Seat map preview"
      >
        {/* Stage indicator */}
        <rect
          x={viewW / 2 - 40} y={4} width={80} height={10} rx={3}
          fill="#e0e7ff" stroke="#a5b4fc" strokeWidth={0.5}
        />
        <text x={viewW / 2} y={11} textAnchor="middle" fontSize={5} fill="#6366f1">
          STAGE
        </text>

        {/* Seats */}
        {rows.map((row) =>
          row.seats.map((seat) => {
            const key = `${row.label}-${seat.number}`;
            const status: SeatStatus = seatStatuses?.[key] ?? 'AVAILABLE';
            const isAccessibleAvailable = status === 'AVAILABLE' && seat.accessible;
            const palette = isAccessibleAvailable ? ACCESSIBLE_AVAILABLE : STATUS_PALETTE[status];

            return (
              <g key={key}>
                <circle
                  cx={seat.x} cy={seat.y} r={8}
                  fill={palette.fill} stroke={palette.stroke} strokeWidth={1}
                />
                {/* Seat number — shift up slightly when accessible icon is shown */}
                <text
                  x={seat.x}
                  y={seat.accessible ? seat.y - 1.5 : seat.y + 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={5}
                  fill={palette.text}
                  style={{ userSelect: 'none' }}
                >
                  {seat.number}
                </text>
                {/* Accessible indicator */}
                {seat.accessible && (
                  <text
                    x={seat.x} y={seat.y + 4}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={4}
                    fill={palette.text}
                    style={{ userSelect: 'none' }}
                  >
                    ♿
                  </text>
                )}
              </g>
            );
          })
        )}

        {/* Row labels */}
        {rows.map((row) => {
          const firstSeat = row.seats[0];
          if (!firstSeat) return null;
          return (
            <text
              key={row.label}
              x={firstSeat.x - 14}
              y={firstSeat.y + 0.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={5}
              fontWeight="600"
              fill="#6b7280"
              style={{ userSelect: 'none' }}
            >
              {row.label}
            </text>
          );
        })}
      </svg>

      {/* Legend — only shown when live status data is present */}
      {showStatus && (
        <div className="flex items-center gap-5 flex-wrap mt-3 px-1">
          {LEGEND_ITEMS.map(({ status, label }) => {
            const { fill, stroke } = STATUS_PALETTE[status];
            return (
              <div key={status} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-full border"
                  style={{ backgroundColor: fill, borderColor: stroke }}
                />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            );
          })}
          {/* Accessible legend entry */}
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full border"
              style={{ backgroundColor: ACCESSIBLE_AVAILABLE.fill, borderColor: ACCESSIBLE_AVAILABLE.stroke }}
            />
            <span className="text-xs text-gray-500">Accessible</span>
          </div>
        </div>
      )}
    </div>
  );
}
