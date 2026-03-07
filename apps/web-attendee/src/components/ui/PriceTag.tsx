import { formatNaira } from '@eventflow/ui';

interface Props {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base font-semibold',
};

export function PriceTag({ amount, size = 'md' }: Props) {
  const formatted = formatNaira(amount);
  const isFree = amount === 0;

  return (
    <span className={`${SIZE_CLASSES[size]} ${isFree ? 'text-emerald-600' : 'text-indigo-600'} font-medium`}>
      {formatted}
    </span>
  );
}
