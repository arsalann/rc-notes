import { VARCHAR } from '@duckdb/node-api';
import { requireAuth } from '~/server/utils/auth';
import { queryAll } from '~/server/utils/db';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const date = String(getRouterParam(event, 'date'));
  const body = await readBody(event);

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body is required' });
  }
  if (typeof body.entry_id !== 'string' || !body.entry_id) {
    throw createError({ statusCode: 400, statusMessage: 'entry_id is required' });
  }
  if (typeof body.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'content is required' });
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'workspace_id')
    || (body.workspace_id !== null && (typeof body.workspace_id !== 'string' || !body.workspace_id))) {
    throw createError({ statusCode: 400, statusMessage: 'workspace_id is required' });
  }
  if (typeof body.expected_updated_at !== 'string' || !body.expected_updated_at) {
    throw createError({ statusCode: 400, statusMessage: 'expected_updated_at is required' });
  }

  const params = {
    entry_id: body.entry_id,
    date,
    user_id: String(user.id),
    user_name: String(user.username),
    workspace_id: body.workspace_id,
    expected_updated_at: body.expected_updated_at,
    content: body.content,
  };
  const types = {
    entry_id: VARCHAR,
    date: VARCHAR,
    user_id: VARCHAR,
    user_name: VARCHAR,
    workspace_id: VARCHAR,
    expected_updated_at: VARCHAR,
    content: VARCHAR,
  };
  const identityWhere = `id = $entry_id
    AND entry_date = $date::DATE
    AND (user_id = $user_id OR user_id IS NULL)
    AND workspace_id IS NOT DISTINCT FROM $workspace_id`;

  const rows = await queryAll(
    `UPDATE diary_entries
     SET content = $content,
         user_id = COALESCE(user_id, $user_id),
         user_name = COALESCE(user_name, $user_name),
         updated_at = current_timestamp,
         updated_by = 'user_in_app'
     WHERE ${identityWhere}
       AND updated_at = $expected_updated_at::TIMESTAMP
     RETURNING *`,
    params,
    types,
  );

  if (rows.length === 1) return rows[0];
  if (rows.length > 1) {
    throw createError({ statusCode: 500, statusMessage: 'Diary update affected multiple entries' });
  }

  const identityParams = {
    entry_id: params.entry_id,
    date: params.date,
    user_id: params.user_id,
    workspace_id: params.workspace_id,
  };
  const identityTypes = {
    entry_id: VARCHAR,
    date: VARCHAR,
    user_id: VARCHAR,
    workspace_id: VARCHAR,
  };
  const existing = await queryAll(
    `SELECT id FROM diary_entries WHERE ${identityWhere} LIMIT 1`,
    identityParams,
    identityTypes,
  );

  if (existing.length) {
    throw createError({ statusCode: 409, statusMessage: 'Diary entry has changed; reload before saving' });
  }
  throw createError({ statusCode: 404, statusMessage: 'Entry not found' });
});
