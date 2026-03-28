interface CircularProgressProps {
  /** Value between 0 and 100 */
  percentage: number;
  /** Diameter of the circle in px (default 120) */
  size?: number;
  /** Stroke width in px (default 10) */
  strokeWidth?: number;
  /** Hex or CSS colour for the progress arc (default indigo) */
  color?: string;
}

/**
 * Pure-SVG circular progress indicator.
 * No third-party dependencies — renders a track circle and a progress arc
 * with the percentage label centred inside.
 */
export function CircularProgress({
  percentage,
  size       = 120,
  strokeWidth = 10,
  color      = '#6366f1',
}: CircularProgressProps) {
  const clamped      = Math.min(100, Math.max(0, percentage));
  const radius       = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset       = circumference - (clamped / 100) * circumference;
  const centre       = size / 2;
  const fontSize     = Math.round(size * 0.19);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`${Math.round(clamped)}% check-in rate`}
      role="img"
    >
      {/* Track (grey background ring) */}
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />

      {/* Progress arc — starts at 12 o'clock via rotate(-90) */}
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${centre} ${centre})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />

      {/* Percentage label */}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill={color}
        fontFamily="Inter, system-ui, sans-serif"
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}
