/**
 * Task templates: a saved task + its subtasks that can be created again. Stored in `task_templates`
 * (not a synced table: the iOS app does not see templates). Subtasks are a JSON array, one level
 * deep, in order: `[{ title, description, priority, tags }]`. A subtask `priority` of null means
 * "same as the task", which is what a new subtask gets anyway.
 */
export interface TemplateSubtask {
  title: string;
  description: string;
  priority: number | null;
  tags: string[];
}

export interface TemplateInput {
  name?: string;
  title?: string;
  description?: string;
  priority?: number;
  tags?: string[];
  subtasks?: TemplateSubtask[];
  workspace_id?: string | null;
}

const MAX_SUBTASKS = 100;
const MAX_TEXT = 10_000;

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function tags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((t): t is string => typeof t === 'string' && !!t.trim()).map(t => t.trim()))];
}

function priority(value: unknown): number | null {
  const p = Number(value);
  return value !== null && value !== undefined && value !== '' && [0, 1, 2, 3].includes(p) ? p : null;
}

export function normalizeSubtasks(value: unknown): TemplateSubtask[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((s: any) => ({
      title: text(s?.title),
      description: text(s?.description, MAX_TEXT),
      priority: priority(s?.priority),
      tags: tags(s?.tags),
    }))
    .filter(s => s.title)
    .slice(0, MAX_SUBTASKS);
}

/** Only the fields present in `body` are returned, so `PUT` can update a subset. */
export function normalizeTemplateInput(body: any): TemplateInput {
  const out: TemplateInput = {};
  if (body?.name !== undefined) out.name = text(body.name, 200);
  if (body?.title !== undefined) out.title = text(body.title);
  if (body?.description !== undefined) out.description = text(body.description, MAX_TEXT);
  if (body?.priority !== undefined) out.priority = priority(body.priority) ?? 2;
  if (body?.tags !== undefined) out.tags = tags(body.tags);
  if (body?.subtasks !== undefined) out.subtasks = normalizeSubtasks(body.subtasks);
  if (body?.workspace_id !== undefined) out.workspace_id = typeof body.workspace_id === 'string' && body.workspace_id ? body.workspace_id : null;
  return out;
}

/** Rows come back with `subtasks` already parsed (JSONB); make sure it is always an array. */
export function presentTemplate(row: Record<string, any>) {
  return { ...row, subtasks: Array.isArray(row.subtasks) ? row.subtasks : [] };
}
