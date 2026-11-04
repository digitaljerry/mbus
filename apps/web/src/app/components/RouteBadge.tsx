import { readableTextOn } from '../lib/routeColors';

export default function RouteBadge({ route, color, size = 'md' }: { route: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-5 min-w-7 px-1.5 text-[0.7rem] rounded-md',
    md: 'h-6 min-w-9 px-2 text-xs rounded-md',
    lg: 'h-8 min-w-11 px-2.5 text-sm rounded-lg',
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-bold tracking-wide tabular ${sizes[size]}`}
      style={{ backgroundColor: color, color: readableTextOn(color) }}
    >
      {route}
    </span>
  );
}
