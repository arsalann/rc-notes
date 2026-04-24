export type PriorityValue = 0 | 1 | 2 | 3;

export interface PriorityOption {
  value: PriorityValue;
  label: string;
  icon: string;
  color: 'error' | 'warning' | 'neutral' | 'primary';
  ringClass: string;
  textClass: string;
}

export const PRIORITY_OPTIONS: PriorityOption[] = [
  { value: 3, label: 'Critical', icon: 'i-lucide-flame',     color: 'error',   ringClass: 'ring-red-500/60',    textClass: 'text-red-400' },
  { value: 2, label: 'Focus',    icon: 'i-lucide-target',    color: 'warning', ringClass: 'ring-amber-500/60',  textClass: 'text-amber-400' },
  { value: 1, label: 'Snack',    icon: 'i-lucide-cookie',    color: 'neutral', ringClass: 'ring-zinc-500/60',   textClass: 'text-zinc-400' },
];

export function getPriorityOption(value: number | undefined | null): PriorityOption | null {
  if (!value) return null;
  return PRIORITY_OPTIONS.find(p => p.value === value) || null;
}
