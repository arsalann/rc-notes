import { TASK_TAG_CATALOG, manualTaskTagKey } from '~/utils/taskTags';

/**
 * Tag settings. A tag is identified by the key a stored tag resolves to (`manualTaskTagKey`): a
 * built-in catalog key or `manual:<normalized>`. `tag_settings` holds per-key display overrides
 * (label, emoji) and `archived` (hidden from the tag pickers; tasks keep the tag). Overrides are
 * display only; renaming a custom tag rewrites `tasks.tags` / `notes.tags` (`tags/rename.post.ts`).
 */
export interface TagSummary {
  key: string;
  /** Name shown in the app: the override label, else the catalog label or most used spelling. */
  label: string;
  /** The catalog label or most used spelling, without the override. */
  name: string;
  emoji: string | null;
  builtin: boolean;
  archived: boolean;
  task_count: number;
  note_count: number;
  /** The exact stored spellings that resolve to this key. */
  variants: string[];
  /** The override row, if any. */
  label_override: string | null;
  emoji_override: string | null;
}

type Query = (sql: string, params?: Record<string, any>, types?: Record<string, any>) => Promise<Record<string, any>[]>;

export async function listTags(query: Query): Promise<TagSummary[]> {
  const [taskRows, noteRows, settings] = await Promise.all([
    query('SELECT tags FROM tasks WHERE cardinality(tags) > 0'),
    query('SELECT tags FROM notes WHERE cardinality(tags) > 0'),
    query('SELECT tag_key, label, emoji, archived FROM tag_settings'),
  ]);

  const usage = new Map<string, { tasks: number; notes: number; spellings: Map<string, number> }>();
  const count = (rows: Record<string, any>[], field: 'tasks' | 'notes') => {
    for (const row of rows) {
      const seen = new Set<string>();
      for (const raw of Array.isArray(row.tags) ? row.tags : []) {
        if (typeof raw !== 'string') continue;
        const key = manualTaskTagKey(raw);
        if (!key) continue;
        const entry = usage.get(key) ?? { tasks: 0, notes: 0, spellings: new Map() };
        entry.spellings.set(raw, (entry.spellings.get(raw) ?? 0) + 1);
        if (!seen.has(key)) entry[field] += 1;
        seen.add(key);
        usage.set(key, entry);
      }
    }
  };
  count(taskRows, 'tasks');
  count(noteRows, 'notes');

  const overrides = new Map(settings.map(s => [String(s.tag_key), s]));
  const summarize = (key: string, name: string, emoji: string | null, builtin: boolean): TagSummary => {
    const use = usage.get(key);
    const o = overrides.get(key);
    const labelOverride = o?.label ? String(o.label) : null;
    const emojiOverride = o?.emoji != null ? String(o.emoji) : null;
    return {
      key,
      label: labelOverride || name,
      name,
      emoji: emojiOverride !== null ? (emojiOverride || null) : emoji,
      builtin,
      archived: !!o?.archived,
      task_count: use?.tasks ?? 0,
      note_count: use?.notes ?? 0,
      variants: use ? [...use.spellings.keys()].sort() : [],
      label_override: labelOverride,
      emoji_override: emojiOverride,
    };
  };

  const out = TASK_TAG_CATALOG.map(t => summarize(t.key, t.label, t.emoji, true));
  const custom: TagSummary[] = [];
  for (const [key, use] of usage) {
    if (!key.startsWith('manual:')) continue;
    const name = [...use.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    custom.push(summarize(key, name, null, false));
  }
  custom.sort((a, b) => a.label.localeCompare(b.label));
  return [...out, ...custom];
}
