import { queryAll } from '~/server/utils/db';
import { BOOLEAN, VARCHAR } from '~/server/utils/sqlTypes';

/**
 * `PUT /api/tags` — body `{ key, label?, emoji?, archived? }`. Display overrides for one tag; no task
 * or note is changed. `label: ''` / `emoji: null` remove that override (an empty-string emoji hides
 * the built-in one).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!key) throw createError({ statusCode: 400, statusMessage: 'key is required' });

  const cols: string[] = [];
  const params: Record<string, any> = { key };
  const types: Record<string, any> = { key: VARCHAR };
  if (body.label !== undefined) {
    cols.push('label');
    params.label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 60) : null;
    types.label = VARCHAR;
  }
  if (body.emoji !== undefined) {
    cols.push('emoji');
    params.emoji = typeof body.emoji === 'string' ? body.emoji.trim().slice(0, 16) : null;
    types.emoji = VARCHAR;
  }
  if (body.archived !== undefined) {
    cols.push('archived');
    params.archived = Boolean(body.archived);
    types.archived = BOOLEAN;
  }
  if (!cols.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' });

  const user = event.context.user as { id?: string } | undefined;
  params.user_id = user?.id ?? null;
  types.user_id = VARCHAR;
  const rows = await queryAll(
    `INSERT INTO tag_settings (tag_key, user_id, ${cols.join(', ')})
     VALUES ($key, $user_id, ${cols.map(c => `$${c}`).join(', ')})
     ON CONFLICT (user_id, tag_key) DO UPDATE SET ${cols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = current_timestamp
     RETURNING *`,
    params, types,
  );
  return rows[0];
});
