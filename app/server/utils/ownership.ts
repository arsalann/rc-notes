import { createError } from 'h3';
import { queryAll } from './db';
import { VARCHAR } from './sqlTypes';

const TABLES = { workspace: 'workspaces', task: 'tasks', note: 'notes', diary: 'diary_entries' } as const;

/** Validate references through RLS before accepting them into a user's rows. A foreign id and a
 * missing id have the same 404 response; never reveal which other user owns an id.
 */
export async function requireOwnedReference(kind: keyof typeof TABLES, id: unknown) {
  if (typeof id !== 'string' || !id) throw createError({ statusCode: 400, statusMessage: 'Invalid reference' });
  const rows = await queryAll(`SELECT id FROM ${TABLES[kind]} WHERE id = $id`, { id }, { id: VARCHAR });
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Referenced item not found' });
}

export async function validateOwnedReferences(body: Record<string, any>) {
  if (body.workspace_id) await requireOwnedReference('workspace', body.workspace_id);
  if (body.parent_id) await requireOwnedReference('task', body.parent_id);
  for (const side of ['source', 'target']) {
    const kind = body[`${side}_type`];
    const id = body[`${side}_id`];
    if (id && ['task', 'note', 'diary'].includes(kind)) await requireOwnedReference(kind as 'task' | 'note' | 'diary', id);
  }
}
