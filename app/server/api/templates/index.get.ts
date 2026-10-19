import { queryAll } from '~/server/utils/db';
import { presentTemplate } from '~/server/utils/templates';

/** `GET /api/templates` — every template, in the order set in Settings. */
export default defineEventHandler(async () => {
  const rows = await queryAll(
    'SELECT * FROM task_templates WHERE deleted_at IS NULL ORDER BY position, lower(name), created_at',
  );
  return rows.map(presentTemplate);
});
