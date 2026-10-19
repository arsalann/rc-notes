import { queryAll } from '~/server/utils/db';
import { manualTaskTagKey, isBuiltInTaskTagKey } from '~/utils/taskTags';
import { listValue, LIST, VARCHAR } from '~/server/utils/sqlTypes';

/**
 * `POST /api/tags/rename` — body `{ key, to }`. Renames a custom tag by rewriting it on every task
 * and note that carries it (every stored spelling that resolves to `key`). If `to` is an existing
 * tag the two merge. The tag's Settings row moves to the new key unless the target has its own.
 * Built-in tags cannot be renamed this way (their label is a display override, `PUT /api/tags`).
 *
 * Returns `{ key, to, tasks, notes }`: the new key and how many rows were rewritten.
 */
const REWRITE = (table: string) => `
  UPDATE ${table} SET tags = ARRAY(
      SELECT x FROM (
        SELECT CASE WHEN u.x = ANY($variants) THEN $to ELSE u.x END AS x, u.n
        FROM unnest(tags) WITH ORDINALITY AS u(x, n)
      ) s GROUP BY x ORDER BY min(n)
    ), updated_at = current_timestamp
  WHERE tags && $variants RETURNING id`;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const to = typeof body?.to === 'string' ? body.to.trim().replace(/^#/, '').slice(0, 60) : '';
  if (!key) throw createError({ statusCode: 400, statusMessage: 'key is required' });
  if (isBuiltInTaskTagKey(key)) {
    throw createError({ statusCode: 400, statusMessage: 'Built-in tags keep their name; change the label instead' });
  }
  const newKey = manualTaskTagKey(to);
  if (!newKey) throw createError({ statusCode: 400, statusMessage: 'New name is required' });

  const all = await queryAll(
    'SELECT DISTINCT unnest(tags) AS tag FROM tasks UNION SELECT DISTINCT unnest(tags) AS tag FROM notes',
  );
  const variants = all.map(r => String(r.tag)).filter(t => manualTaskTagKey(t) === key);
  if (!variants.length) throw createError({ statusCode: 404, statusMessage: 'No task or note has this tag' });

  const params = { variants: listValue(variants), to };
  const types = { variants: LIST(VARCHAR), to: VARCHAR };
  const tasks = await queryAll(REWRITE('tasks'), params, types);
  const notes = await queryAll(REWRITE('notes'), params, types);

  if (newKey !== key) {
    await queryAll(
      `UPDATE tag_settings SET tag_key = $new_key, updated_at = current_timestamp
       WHERE tag_key = $key AND NOT EXISTS (SELECT 1 FROM tag_settings WHERE tag_key = $new_key)`,
      { key, new_key: newKey }, { key: VARCHAR, new_key: VARCHAR },
    );
    await queryAll('DELETE FROM tag_settings WHERE tag_key = $key', { key }, { key: VARCHAR });
  }

  return { key: newKey, to, tasks: tasks.length, notes: notes.length };
});
