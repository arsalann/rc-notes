import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '~/server/utils/sqlTypes';

/** `DELETE /api/templates/:id` — soft delete (`deleted_at`); the row stays for recovery. */
export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id'));
  const rows = await queryAll(
    `UPDATE task_templates SET deleted_at = COALESCE(deleted_at, current_timestamp), updated_at = current_timestamp
     WHERE id = $id RETURNING id`,
    { id }, { id: VARCHAR },
  );
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Template not found' });
  return { id, deleted: true };
});
