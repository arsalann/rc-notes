import { validateOwnedReferences } from '~/server/utils/ownership';
import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '~/server/utils/sqlTypes';
import { clientId } from '~/server/utils/ids';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  await validateOwnedReferences(body || {});
  const { source_type, source_id, target_type, target_id } = body;

  if (!['task', 'note', 'diary'].includes(source_type) || !['task', 'note', 'diary'].includes(target_type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid type' });
  }
  if (!source_id || !target_id) throw createError({ statusCode: 400, statusMessage: 'IDs required' });

  // Check for duplicate
  const existing = await queryAll(
    `SELECT id FROM links WHERE
      (source_type = $st AND source_id = $si AND target_type = $tt AND target_id = $ti)
      OR (source_type = $tt AND source_id = $ti AND target_type = $st AND target_id = $si)`,
    { st: source_type, si: source_id, tt: target_type, ti: target_id },
    { st: VARCHAR, si: VARCHAR, tt: VARCHAR, ti: VARCHAR }
  );
  if (existing.length) return existing[0];

  const id = clientId(body.id);
  const rows = await queryAll(
    `INSERT INTO links (id, source_type, source_id, target_type, target_id)
     VALUES (${id ? '$id' : 'gen_random_uuid()::text'}, $st, $si, $tt, $ti)
     ON CONFLICT (id) DO NOTHING RETURNING *`,
    { st: source_type, si: source_id, tt: target_type, ti: target_id, ...(id ? { id } : {}) },
    { st: VARCHAR, si: VARCHAR, tt: VARCHAR, ti: VARCHAR, id: VARCHAR }
  );
  if (!rows.length && id) {
    return (await queryAll('SELECT * FROM links WHERE id = $id', { id }, { id: VARCHAR }))[0];
  }
  setResponseStatus(event, 201);
  return rows[0];
});
