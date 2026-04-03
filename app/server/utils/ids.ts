import { queryAll } from './db';
import { VARCHAR } from '@duckdb/node-api';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function randLetters(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += LETTERS[Math.floor(Math.random() * 26)];
  return s;
}

function firstN(s: string | undefined | null, n: number): string {
  if (!s || !s.trim()) return randLetters(n);
  const clean = s.trim().replace(/[^a-zA-Z0-9]/g, '');
  if (!clean) return randLetters(n);
  return clean.slice(0, n).toLowerCase().padEnd(n, randLetters(1));
}

/**
 * Task/Note display ID prefix: <first 3 of title><first 2 of tag or random>
 * e.g. "Buy groceries" + tag "personal" → "buyPe"
 */
function makePrefix(title: string, tags: string[]): string {
  const titlePart = firstN(title, 3);
  const tagPart = tags.length ? firstN(tags[0], 2) : randLetters(2);
  return titlePart + tagPart;
}

/**
 * Generate task display_id: <prefix><3 sequential digits>
 * e.g. buyPe000, buyPe001
 */
export async function generateTaskDisplayId(title: string, tags: string[]): Promise<string> {
  const prefix = makePrefix(title, tags);
  const rows = await queryAll(
    "SELECT display_id FROM tasks WHERE display_id LIKE $pattern ORDER BY display_id DESC LIMIT 1",
    { pattern: `${prefix}%` },
    { pattern: VARCHAR }
  );
  let seq = 0;
  if (rows.length && rows[0].display_id) {
    const existing = rows[0].display_id as string;
    const numPart = existing.slice(prefix.length);
    // Only count the base 3-digit part (not subtask suffixes)
    const match = numPart.match(/^(\d{3})/);
    if (match) seq = parseInt(match[1], 10) + 1;
  }
  return prefix + String(seq).padStart(3, '0');
}

/**
 * Generate subtask display_id: <parent display_id><2 sequential digits>
 * e.g. buyPe00001, buyPe00002
 */
export async function generateSubtaskDisplayId(parentDisplayId: string, parentId: string): Promise<string> {
  const rows = await queryAll(
    "SELECT count(*)::INTEGER as c FROM tasks WHERE parent_id = $pid",
    { pid: parentId },
    { pid: VARCHAR }
  );
  const seq = (rows[0]?.c ?? 0) + 1;
  return parentDisplayId + String(seq).padStart(2, '0');
}

/**
 * Generate note display_id: <prefix><3 sequential digits>
 * e.g. meewO000, meewO001
 */
export async function generateNoteDisplayId(title: string, tags: string[]): Promise<string> {
  const prefix = makePrefix(title, tags);
  const rows = await queryAll(
    "SELECT display_id FROM notes WHERE display_id LIKE $pattern ORDER BY display_id DESC LIMIT 1",
    { pattern: `${prefix}%` },
    { pattern: VARCHAR }
  );
  let seq = 0;
  if (rows.length && rows[0].display_id) {
    const existing = rows[0].display_id as string;
    const numPart = existing.slice(prefix.length);
    const match = numPart.match(/^(\d{3})/);
    if (match) seq = parseInt(match[1], 10) + 1;
  }
  return prefix + String(seq).padStart(3, '0');
}
