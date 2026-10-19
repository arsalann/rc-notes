import { manualTaskTagKey, type ResolvedTaskTag } from '~/utils/taskTags';

/** One tag as `GET /api/tags` returns it (see `server/utils/tags.ts`). */
export interface TagSummary {
  key: string;
  label: string;
  name: string;
  emoji: string | null;
  builtin: boolean;
  archived: boolean;
  task_count: number;
  note_count: number;
  variants: string[];
  label_override: string | null;
  emoji_override: string | null;
}

/**
 * Tag settings from Settings → Tags: display overrides (label, emoji) and archived tags, shared by
 * every screen. Loaded once per session; `present()` applies the overrides to a resolved tag.
 */
export function useTagSettings() {
  const tags = useState<TagSummary[]>('tag-settings', () => []);
  const loaded = useState<boolean>('tag-settings-loaded', () => false);
  const loading = useState<Promise<void> | null>('tag-settings-loading', () => null);

  async function fetchTags() {
    loading.value = (async () => {
      try {
        tags.value = await $fetch<TagSummary[]>('/api/tags');
        loaded.value = true;
      } catch {
        // Signed out or offline: built-in labels still render.
      } finally {
        loading.value = null;
      }
    })();
    return loading.value;
  }

  function ensureLoaded() {
    if (import.meta.client && !loaded.value && !loading.value) fetchTags();
  }

  const byKey = computed(() => new Map(tags.value.map(t => [t.key, t])));

  /** A resolved tag with the Settings label/emoji applied. */
  function present(tag: ResolvedTaskTag): ResolvedTaskTag {
    const s = byKey.value.get(tag.key);
    if (!s) return tag;
    return { ...tag, label: s.label_override || tag.label, emoji: s.emoji_override !== null ? (s.emoji_override || null) : tag.emoji };
  }

  function presentAll(list: readonly ResolvedTaskTag[] | null | undefined): ResolvedTaskTag[] {
    return (list || []).map(present);
  }

  function isArchived(rawOrKey: string): boolean {
    const key = byKey.value.has(rawOrKey) ? rawOrKey : manualTaskTagKey(rawOrKey);
    return !!(key && byKey.value.get(key)?.archived);
  }

  async function updateTag(key: string, patch: { label?: string | null; emoji?: string | null; archived?: boolean }) {
    await $fetch('/api/tags', { method: 'PUT', body: { key, ...patch } });
    await fetchTags();
  }

  async function renameTag(key: string, to: string) {
    const result = await $fetch<{ key: string; to: string; tasks: number; notes: number }>('/api/tags/rename', {
      method: 'POST',
      body: { key, to },
    });
    await fetchTags();
    return result;
  }

  return { tags, loaded, fetchTags, ensureLoaded, present, presentAll, isArchived, updateTag, renameTag };
}
