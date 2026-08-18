import type { ResolvedTaskTag } from '~/utils/taskTags';

export interface Task {
  id: string;
  display_id: string;
  user_id: string | null;
  user_name: string | null;
  workspace_id: string | null;
  parent_id: string | null;
  title: string;
  description: string;
  status: string;
  priority: number;
  completed: boolean;
  completed_at: string | null;
  pinned: boolean;
  archived: boolean;
  deleted_at: string | null;
  due_at: string | null;
  reminder_at: string | null;
  tags: string[];
  detected_tags?: ResolvedTaskTag[];
  resolved_tags?: ResolvedTaskTag[];
  position: number;
  created_at: string;
  updated_at: string;
  subtask_count?: number;
  subtask_done?: number;
  subtasks?: Task[];
}

export interface Note {
  id: string;
  display_id: string;
  user_id: string | null;
  user_name: string | null;
  workspace_id: string | null;
  title: string;
  content: string;
  preview?: string;
  pinned: boolean;
  archived: boolean;
  deleted_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  links?: any[];
}

export function useTasks() {
  const tasks = useState<Task[]>('tasks', () => []);
  const loading = ref(false);

  async function fetchTasks(opts: { archived?: boolean; workspace_id?: string | null } = {}) {
    loading.value = true;
    try {
      const query: Record<string, string> = {};
      if (opts.archived !== undefined) query.archived = String(opts.archived);
      if (opts.workspace_id) query.workspace_id = opts.workspace_id;
      tasks.value = await $fetch<Task[]>('/api/tasks', { query });
    } finally {
      loading.value = false;
    }
  }

  async function createTask(data: { title: string; description?: string; parent_id?: string; workspace_id?: string | null; tags?: string[]; due_at?: string; priority?: number; status?: string; id?: string }) {
    const task = await $fetch<Task>('/api/tasks', { method: 'POST', body: data });
    if (!data.parent_id) tasks.value = [task, ...tasks.value];
    return task;
  }

  /**
   * Mint an id on the client so `POST /api/tasks` is idempotent — a retried create resolves to the
   * same row instead of a second task. Also means an optimistic row already carries its final id,
   * so there is no provisional-to-real transition for links or positions to trip over.
   */
  function newTaskId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // Fallback for older WebViews, which lack randomUUID on non-secure origins.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /**
   * Replace a task in `tasks` with whatever the server last told us, discarding an optimistic guess.
   *
   * Refetch rather than invert the local flag: `$fetch` rejects on a network timeout even when the
   * write actually landed, so inverting would leave the UI silently disagreeing with the database.
   * Asking the server is the only way to know which happened.
   */
  async function resyncTask(id: string) {
    try {
      const fresh = await $fetch<Task>(`/api/tasks/${id}`);
      const idx = tasks.value.findIndex(t => t.id === id);
      if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], ...fresh };
      return fresh;
    } catch {
      // 404 means it is genuinely gone; drop it rather than leaving a phantom row.
      tasks.value = tasks.value.filter(t => t.id !== id);
      return null;
    }
  }

  function patchLocalTask(id: string, patch: Partial<Task>) {
    const idx = tasks.value.findIndex(t => t.id === id);
    if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], ...patch };
  }

  async function updateTask(id: string, data: Partial<Task>) {
    return await $fetch<Task>(`/api/tasks/${id}`, { method: 'PUT', body: data });
  }

  /**
   * Bulk position/priority write for drag reorder — one request instead of one per task.
   * All-or-nothing: either every row moves or none does.
   */
  async function updateTaskPositions(items: { id: string; position: number; priority?: number }[]) {
    if (!items.length) return { requested: 0, updated: 0, ids: [] as string[] };
    return await $fetch<{ requested: number; updated: number; ids: string[] }>('/api/tasks/positions', {
      method: 'PATCH',
      body: { items },
    });
  }

  async function deleteTask(id: string) {
    await $fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    tasks.value = tasks.value.filter(t => t.id !== id);
  }

  /**
   * Flip completion locally first, then confirm with the server.
   *
   * `next` is sent explicitly so the write is idempotent — see `complete.patch.ts`. Callers that
   * hold their own copy of the task (InlineTask, TaskItem) pass the value they are rendering.
   */
  async function toggleComplete(id: string, next?: boolean) {
    const current = tasks.value.find(t => t.id === id);
    const target = typeof next === 'boolean' ? next : !current?.completed;

    // Optimistic: paint the new state before the round trip.
    patchLocalTask(id, {
      completed: target,
      status: target ? 'done' : 'next',
      completed_at: target ? (current?.completed_at ?? new Date().toISOString()) : null,
    });

    try {
      const updated = await $fetch<Task>(`/api/tasks/${id}/complete`, {
        method: 'PATCH',
        body: { completed: target },
      });
      // Server response is the authority — it carries the real completed_at and status.
      patchLocalTask(id, updated);
      return updated;
    } catch (e) {
      await resyncTask(id);
      throw e;
    }
  }

  async function togglePin(id: string, next?: boolean) {
    const current = tasks.value.find(t => t.id === id);
    const target = typeof next === 'boolean' ? next : !current?.pinned;

    patchLocalTask(id, { pinned: target });

    try {
      const updated = await $fetch<Task>(`/api/tasks/${id}/pin`, {
        method: 'PATCH',
        body: { pinned: target },
      });
      patchLocalTask(id, updated);
      return updated;
    } catch (e) {
      await resyncTask(id);
      throw e;
    }
  }

  async function toggleArchive(id: string) {
    await $fetch<Task>(`/api/tasks/${id}/archive`, { method: 'PATCH' });
    tasks.value = tasks.value.filter(t => t.id !== id);
  }

  return { tasks, loading, fetchTasks, createTask, newTaskId, updateTask, updateTaskPositions, deleteTask, toggleComplete, togglePin, toggleArchive, resyncTask };
}

export function useNotesCrud() {
  const notes = useState<Note[]>('notes', () => []);
  const loading = ref(false);

  async function fetchNotes(opts: { archived?: boolean; workspace_id?: string | null } = {}) {
    loading.value = true;
    try {
      const query: Record<string, string> = {};
      if (opts.archived !== undefined) query.archived = String(opts.archived);
      if (opts.workspace_id) query.workspace_id = opts.workspace_id;
      notes.value = await $fetch<Note[]>('/api/notes', { query });
    } finally {
      loading.value = false;
    }
  }

  async function createNote(data: { title: string; content?: string; workspace_id?: string | null; tags?: string[] }) {
    const note = await $fetch<Note>('/api/notes', { method: 'POST', body: data });
    notes.value = [note, ...notes.value];
    return note;
  }

  async function updateNote(id: string, data: Partial<Note>) {
    return await $fetch<Note>(`/api/notes/${id}`, { method: 'PUT', body: data });
  }

  async function deleteNote(id: string) {
    await $fetch(`/api/notes/${id}`, { method: 'DELETE' });
    notes.value = notes.value.filter(n => n.id !== id);
  }

  async function togglePin(id: string) {
    const updated = await $fetch<Note>(`/api/notes/${id}/pin`, { method: 'PATCH' });
    const idx = notes.value.findIndex(n => n.id === id);
    if (idx >= 0) notes.value[idx] = { ...notes.value[idx], ...updated };
    return updated;
  }

  return { notes, loading, fetchNotes, createNote, updateNote, deleteNote, togglePin };
}
