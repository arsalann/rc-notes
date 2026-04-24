import { todayLocal, localDateOffset } from '~/composables/useDate';

const PRIORITY_MAP: Record<string, number> = {
  critical: 3,
  crit: 3,
  focus: 2,
  snack: 1,
  none: 0,
  nopriority: 0,
};

const STATUS_MAP: Record<string, string> = {
  now: 'now',
  next: 'next',
  done: 'done',
};

function dueShortcut(token: string): string | null {
  if (token === 'today') return `${todayLocal()}T09:00`;
  if (token === 'tomorrow') return `${localDateOffset(1)}T09:00`;
  if (token === 'nextweek' || token === 'next-week') return `${localDateOffset(7)}T09:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return `${token}T09:00`;
  return null;
}

export interface ParsedTitle {
  title: string;
  tags: string[];
  priority?: number;
  status?: string;
  due_at?: string;
}

export function parseHashtags(input: string): ParsedTitle {
  const tags: string[] = [];
  let priority: number | undefined;
  let status: string | undefined;
  let due_at: string | undefined;

  const cleaned = input.replace(/#([\w-]+)/g, (_, raw: string) => {
    const tok = raw.toLowerCase();
    if (tok in PRIORITY_MAP) { priority = PRIORITY_MAP[tok]; return ''; }
    if (tok in STATUS_MAP) { status = STATUS_MAP[tok]; return ''; }
    const d = dueShortcut(tok);
    if (d) { due_at = d; return ''; }
    tags.push(tok);
    return '';
  }).replace(/\s{2,}/g, ' ').trim();

  return {
    title: cleaned,
    tags: [...new Set(tags)],
    priority,
    status,
    due_at,
  };
}
