import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const date = String(getRouterParam(event, 'date'));
  const { workspace_id } = getQuery(event);

  let where = "entry_date = $date::DATE";
  const params: Record<string, any> = { date };
  const types: Record<string, any> = { date: VARCHAR };

  if (workspace_id) {
    where += " AND workspace_id = $ws";
    params.ws = workspace_id;
    types.ws = VARCHAR;
  }

  const rows = await queryAll(`SELECT * FROM diary_entries WHERE ${where}`, params, types);
  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'No entry for this date' });
  }

  const entry = rows[0];
  const entryWorkspaceId = entry.workspace_id as string | null;

  // Auto-bump overdue tasks (scoped to this diary entry's workspace)
  const newDueAt = `${date}T12:00:00`;
  const bumpParams: Record<string, any> = { due: newDueAt, date };
  const bumpTypes: Record<string, any> = { due: VARCHAR, date: VARCHAR };
  let bumpWs = '';
  if (entryWorkspaceId) {
    bumpWs = ' AND workspace_id = $ws';
    bumpParams.ws = entryWorkspaceId;
    bumpTypes.ws = VARCHAR;
  } else {
    bumpWs = ' AND workspace_id IS NULL';
  }
  await queryAll(
    `UPDATE tasks SET due_at = $due::TIMESTAMP, updated_at = now()
     WHERE due_at IS NOT NULL AND due_at::DATE < $date::DATE
       AND completed = false AND deleted_at IS NULL${bumpWs}`,
    bumpParams, bumpTypes
  ).catch(() => {});

  // Batch-create diary links for every task due on this date (same workspace only)
  const linkParams: Record<string, any> = { did: entry.id as string, date };
  const linkTypes: Record<string, any> = { did: VARCHAR, date: VARCHAR };
  let linkWs = '';
  if (entryWorkspaceId) {
    linkWs = ' AND t.workspace_id = $ws';
    linkParams.ws = entryWorkspaceId;
    linkTypes.ws = VARCHAR;
  } else {
    linkWs = ' AND t.workspace_id IS NULL';
  }
  await queryAll(
    `INSERT INTO links (id, source_type, source_id, target_type, target_id)
     SELECT uuid()::VARCHAR, 'diary', $did, 'task', t.id
     FROM tasks t
     WHERE t.due_at IS NOT NULL AND t.due_at::DATE = $date::DATE
       AND t.completed = false AND t.deleted_at IS NULL${linkWs}
       AND NOT EXISTS (
         SELECT 1 FROM links l WHERE l.source_type = 'diary' AND l.source_id = $did AND l.target_type = 'task' AND l.target_id = t.id
       )`,
    linkParams, linkTypes
  ).catch(() => {});

  // Fetch linked items — task/note workspace must match this entry's workspace
  const linksReadParams: Record<string, any> = { id: entry.id };
  const linksReadTypes: Record<string, any> = { id: VARCHAR };
  let wsMatch = '';
  if (entryWorkspaceId) {
    wsMatch = `AND (
      (l.target_type = 'task' AND t.workspace_id = $ws)
      OR (l.target_type = 'note' AND n.workspace_id = $ws)
    )`;
    linksReadParams.ws = entryWorkspaceId;
    linksReadTypes.ws = VARCHAR;
  } else {
    wsMatch = `AND (
      (l.target_type = 'task' AND t.workspace_id IS NULL)
      OR (l.target_type = 'note' AND n.workspace_id IS NULL)
    )`;
  }
  const links = await queryAll(`
    SELECT l.id as link_id, l.target_type, l.target_id,
      COALESCE(t.title, n.title) as target_title
    FROM links l
    LEFT JOIN tasks t ON l.target_type = 'task' AND t.id = l.target_id
    LEFT JOIN notes n ON l.target_type = 'note' AND n.id = l.target_id
    WHERE l.source_type = 'diary' AND l.source_id = $id ${wsMatch}
  `, linksReadParams, linksReadTypes);

  // Batch auto-set due_at on linked tasks that don't have one yet
  const taskLinkIds = links.filter((l: any) => l.target_type === 'task').map((l: any) => l.target_id);
  if (taskLinkIds.length) {
    const dueAt = `${date}T12:00:00`;
    const idList = taskLinkIds.map((tid: string) => `'${tid.replace(/'/g, "''")}'`).join(',');
    await queryAll(
      `UPDATE tasks SET due_at = $due_at::TIMESTAMP, updated_at = now()
       WHERE id IN (${idList}) AND due_at IS NULL`,
      { due_at: dueAt },
      { due_at: VARCHAR }
    ).catch(() => {});
  }

  return { ...entry, links };
});
