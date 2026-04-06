/**
 * Parse a server timestamp (UTC, no timezone suffix) into a proper Date object.
 * Server returns timestamps like "2026-04-07 12:00:00" which are UTC.
 * Without this, `new Date("2026-04-07 12:00:00")` is parsed as local time in most browsers.
 */
export function parseUTC(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  // Normalize: replace space with T and append Z if no timezone indicator
  const normalized = dateStr.replace(' ', 'T');
  if (/[Zz+\-]\d{0,4}$/.test(normalized)) return new Date(normalized);
  return new Date(normalized + 'Z');
}

/**
 * Format a UTC server timestamp as a relative due date label in local timezone.
 */
export function formatDue(dateStr: string): string {
  const d = parseUTC(dateStr);
  const now = new Date();

  // Compare dates in local timezone
  const dLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dLocal.getTime() - nowLocal.getTime()) / 86400000);

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Check if a UTC server timestamp is overdue (before today in local timezone).
 */
export function isOverdue(dateStr: string): boolean {
  const d = parseUTC(dateStr);
  const now = new Date();
  const dLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return dLocal < nowLocal;
}

/**
 * Get today's date as a YYYY-MM-DD string in local timezone.
 */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Get a local date offset from today as YYYY-MM-DD.
 */
export function localDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
