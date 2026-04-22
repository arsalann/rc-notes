export function isWithinNextDays(isoDate: string, days: number): boolean {
  const due = new Date(isoDate);
  if (isNaN(due.getTime())) return false;
  const now = Date.now();
  const cutoff = now + days * 24 * 60 * 60 * 1000;
  return due.getTime() <= cutoff;
}
