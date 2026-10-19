import { queryAll } from '~/server/utils/db';
import { normalizeTemplateInput, presentTemplate } from '~/server/utils/templates';
import { listValue, LIST, VARCHAR, INTEGER } from '~/server/utils/sqlTypes';

/** `PUT /api/templates/:id` — any of `name, title, description, priority, tags, subtasks, workspace_id, position`. */
export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));
  const body = await readBody(event);
  const input = normalizeTemplateInput(body);

  const sets: string[] = [];
  const params: Record<string, any> = { id };
  const types: Record<string, any> = { id: VARCHAR };
  const set = (column: string, value: any, type: any, cast = '') => {
    sets.push(`${column} = $${column}${cast}`);
    params[column] = value;
    types[column] = type;
  };

  if (input.name !== undefined) {
    if (!input.name) throw createError({ statusCode: 400, statusMessage: 'Name cannot be empty' });
    set('name', input.name, VARCHAR);
  }
  if (input.title !== undefined) {
    if (!input.title) throw createError({ statusCode: 400, statusMessage: 'Task title cannot be empty' });
    set('title', input.title, VARCHAR);
  }
  if (input.description !== undefined) set('description', input.description, VARCHAR);
  if (input.priority !== undefined) set('priority', input.priority, INTEGER);
  if (input.tags !== undefined) set('tags', listValue(input.tags), LIST(VARCHAR));
  if (input.subtasks !== undefined) set('subtasks', JSON.stringify(input.subtasks), VARCHAR, '::jsonb');
  if (input.workspace_id !== undefined) set('workspace_id', input.workspace_id, VARCHAR);
  if (body?.position !== undefined && Number.isInteger(Number(body.position))) set('position', Number(body.position), INTEGER);

  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' });
  sets.push('updated_at = current_timestamp');

  const rows = await queryAll(
    `UPDATE task_templates SET ${sets.join(', ')} WHERE id = $id AND deleted_at IS NULL RETURNING *`,
    params, types,
  );
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Template not found' });
  return presentTemplate(rows[0]!);
});
