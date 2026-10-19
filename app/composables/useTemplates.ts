import type { Task } from '~/composables/useNotes';

export interface TemplateSubtask {
  title: string;
  description: string;
  /** null = same priority as the task. */
  priority: number | null;
  tags: string[];
}

export interface TaskTemplate {
  id: string;
  workspace_id: string | null;
  name: string;
  title: string;
  description: string;
  priority: number;
  tags: string[];
  subtasks: TemplateSubtask[];
  position: number;
  created_at: string;
  updated_at: string;
}

export type TemplateInput = Partial<Pick<TaskTemplate, 'name' | 'title' | 'description' | 'priority' | 'tags' | 'subtasks' | 'workspace_id' | 'position'>>;

/** Task templates: save a task + subtasks, edit them in Settings, create them again. */
export function useTemplates() {
  const templates = useState<TaskTemplate[]>('task-templates', () => []);
  const loaded = useState<boolean>('task-templates-loaded', () => false);
  const { createTask, newTaskId } = useTasks();

  async function fetchTemplates() {
    templates.value = await $fetch<TaskTemplate[]>('/api/templates');
    loaded.value = true;
    return templates.value;
  }

  function ensureLoaded() {
    if (import.meta.client && !loaded.value) fetchTemplates().catch(() => {});
  }

  async function createTemplate(data: TemplateInput) {
    const created = await $fetch<TaskTemplate>('/api/templates', { method: 'POST', body: { id: newTaskId(), ...data } });
    templates.value = [...templates.value.filter(t => t.id !== created.id), created];
    return created;
  }

  /** Build a template from a task and its (non-archived) subtasks. */
  async function saveTaskAsTemplate(task: Task, subtasks: Task[], name?: string) {
    return createTemplate({
      name: name?.trim() || task.title,
      title: task.title,
      description: task.description || '',
      priority: task.priority ?? 2,
      tags: [...(task.tags || [])],
      workspace_id: task.workspace_id,
      subtasks: subtasks.filter(s => !s.archived).map(s => ({
        title: s.title,
        description: s.description || '',
        // Store "inherit" when it matches the task, so changing the template's priority carries over.
        priority: s.priority === task.priority ? null : s.priority,
        tags: [...(s.tags || [])],
      })),
    });
  }

  async function updateTemplate(id: string, data: TemplateInput) {
    const updated = await $fetch<TaskTemplate>(`/api/templates/${id}`, { method: 'PUT', body: data });
    templates.value = templates.value.map(t => (t.id === id ? updated : t));
    return updated;
  }

  async function deleteTemplate(id: string) {
    await $fetch(`/api/templates/${id}`, { method: 'DELETE' });
    templates.value = templates.value.filter(t => t.id !== id);
  }

  /**
   * Create the template's task, then its subtasks in order. Client ids make each create idempotent,
   * so a retry after a failure part-way never duplicates what was already made.
   */
  async function instantiateTemplate(template: TaskTemplate, opts: { workspace_id?: string | null; due_at?: string; status?: string } = {}) {
    const workspaceId = opts.workspace_id !== undefined ? opts.workspace_id : template.workspace_id;
    const task = await createTask({
      id: newTaskId(),
      title: template.title || template.name,
      description: template.description || undefined,
      priority: template.priority,
      tags: template.tags?.length ? [...template.tags] : undefined,
      workspace_id: workspaceId,
      due_at: opts.due_at,
      status: opts.status,
    });
    for (const sub of template.subtasks || []) {
      await createTask({
        id: newTaskId(),
        title: sub.title,
        description: sub.description || undefined,
        parent_id: task.id,
        priority: sub.priority ?? undefined,
        tags: sub.tags?.length ? [...sub.tags] : undefined,
        workspace_id: workspaceId,
      });
    }
    return task;
  }

  return { templates, loaded, fetchTemplates, ensureLoaded, createTemplate, saveTaskAsTemplate, updateTemplate, deleteTemplate, instantiateTemplate };
}
