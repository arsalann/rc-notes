import { queryAll } from '~/server/utils/db';
import { clientId } from '~/server/utils/ids';
import { normalizeTemplateInput, presentTemplate } from '~/server/utils/templates';
import { listValue, LIST, VARCHAR, INTEGER } from '~/server/utils/sqlTypes';

/**
 * `POST /api/templates` — body `{ id?, name, title, description?, priority?, tags?, subtasks?, workspace_id? }`
 *
 * "Save as template" on a task sends the task and its subtasks in this shape. A client `id` makes a
 * retried request return the same template instead of a second one.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const input = normalizeTemplateInput(body);
  const title = input.title || input.name || '';
  const name = input.name || title;
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name or title is required' });

  const id = clientId(body?.id);
  const user = event.context.user as { id?: string; username?: string } | undefined;
  const rows = await queryAll(
    `INSERT INTO task_templates (id, user_id, user_name, workspace_id, name, title, description, priority, tags, subtasks, position)
     VALUES (${id ? '$id' : 'gen_random_uuid()::text'}, $user_id, $user_name, $workspace_id, $name, $title, $description,
       $priority, $tags, $subtasks::jsonb,
       (SELECT COALESCE(MAX(position), -1) + 1 FROM task_templates WHERE deleted_at IS NULL))
     ${id ? 'ON CONFLICT (id) DO NOTHING' : ''}
     RETURNING *`,
    {
      id,
      user_id: user?.id ?? null,
      user_name: user?.username ?? null,
      workspace_id: input.workspace_id ?? null,
      name,
      title,
      description: input.description ?? '',
      priority: input.priority ?? 2,
      tags: listValue(input.tags ?? []),
      subtasks: JSON.stringify(input.subtasks ?? []),
    },
    {
      id: VARCHAR, user_id: VARCHAR, user_name: VARCHAR, workspace_id: VARCHAR, name: VARCHAR, title: VARCHAR,
      description: VARCHAR, priority: INTEGER, tags: LIST(VARCHAR), subtasks: VARCHAR,
    },
  );
  if (!rows.length && id) {
    const existing = await queryAll('SELECT * FROM task_templates WHERE id = $id', { id }, { id: VARCHAR });
    if (existing.length) return presentTemplate(existing[0]!);
  }
  setResponseStatus(event, 201);
  return presentTemplate(rows[0]!);
});
