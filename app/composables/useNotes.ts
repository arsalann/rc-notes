export interface Task {
  id: string;
  workspace_id: string | null;
  parent_id: string | null;
  title: string;
  description: string;
  completed: boolean;
  completed_at: string | null;
  pinned: boolean;
  archived: boolean;
  due_at: string | null;
  tags: string[];
  position: number;
  created_at: string;
  updated_at: string;
  subtask_count?: number;
  subtask_done?: number;
  subtasks?: Task[];
}

export interface Note {
  id: string;
  workspace_id: string | null;
  title: string;
  content: string;
  preview?: string;
  pinned: boolean;
  archived: boolean;
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

  async function createTask(data: { title: string; description?: string; parent_id?: string; workspace_id?: string | null; tags?: string[]; due_at?: string }) {
    const task = await $fetch<Task>('/api/tasks', { method: 'POST', body: data });
    if (!data.parent_id) tasks.value = [task, ...tasks.value];
    return task;
  }

  async function updateTask(id: string, data: Partial<Task>) {
    return await $fetch<Task>(`/api/tasks/${id}`, { method: 'PUT', body: data });
  }

  async function deleteTask(id: string) {
    await $fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    tasks.value = tasks.value.filter(t => t.id !== id);
  }

  async function toggleComplete(id: string) {
    const updated = await $fetch<Task>(`/api/tasks/${id}/complete`, { method: 'PATCH' });
    const idx = tasks.value.findIndex(t => t.id === id);
    if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], ...updated };
    return updated;
  }

  async function togglePin(id: string) {
    const updated = await $fetch<Task>(`/api/tasks/${id}/pin`, { method: 'PATCH' });
    const idx = tasks.value.findIndex(t => t.id === id);
    if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], ...updated };
    return updated;
  }

  async function toggleArchive(id: string) {
    await $fetch<Task>(`/api/tasks/${id}/archive`, { method: 'PATCH' });
    tasks.value = tasks.value.filter(t => t.id !== id);
  }

  return { tasks, loading, fetchTasks, createTask, updateTask, deleteTask, toggleComplete, togglePin, toggleArchive };
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
