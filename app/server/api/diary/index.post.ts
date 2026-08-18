import { queryAll } from '~/server/utils/db';
import { hydrateTasksByIds, taskIdsFromLinks } from '~/server/utils/taskHydration';
import { listValue, LIST, VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const entryDate = body.entry_date;
  const content = body.content || '';
  const workspaceId = body.workspace_id || null;

  if (!entryDate) throw createError({ statusCode: 400, statusMessage: 'entry_date is required' });

  // Check if entry already exists
  let where = "entry_date = $date::DATE";
  const params: Record<string, any> = { date: entryDate };
  const types: Record<string, any> = { date: VARCHAR };

  if (workspaceId) {
    where += " AND workspace_id = $ws";
    params.ws = workspaceId;
    types.ws = VARCHAR;
  }

  const existing = await queryAll(`SELECT * FROM diary_entries WHERE ${where}`, params, types);
  if (existing.length) return existing[0];

  // Create new entry — default to Work workspace
  const cols = ['id', 'entry_date', 'content', 'workspace_id'];
  const vals = ['uuid()::VARCHAR', '$date::DATE', '$content', '$ws'];
  const insertParams: Record<string, any> = { date: entryDate, content };
  const insertTypes: Record<string, any> = { date: VARCHAR, content: VARCHAR };

  // Use provided workspace or look up Work workspace
  let wsId = workspaceId;
  if (!wsId) {
    const { getDefaultWorkspaceId } = await import('~/server/utils/db');
    wsId = await getDefaultWorkspaceId();
  }
  if (wsId) {
    insertParams.ws = wsId;
    insertTypes.ws = VARCHAR;
  } else {
    cols.pop();
    vals.pop();
  }

  const rows = await queryAll(
    `INSERT INTO diary_entries (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`,
    insertParams, insertTypes
  );
  const newEntry = rows[0];

  // Carry forward undone tasks from the most recent previous entry
  let prevWhere = "entry_date < $date::DATE";
  const prevParams: Record<string, any> = { date: entryDate };
  const prevTypes: Record<string, any> = { date: VARCHAR };

  if (workspaceId) {
    prevWhere += " AND workspace_id = $ws";
    prevParams.ws = workspaceId;
    prevTypes.ws = VARCHAR;
  }

  const prevEntries = await queryAll(
    `SELECT id FROM diary_entries WHERE ${prevWhere} ORDER BY entry_date DESC LIMIT 1`,
    prevParams, prevTypes
  );

  const carriedTasks: any[] = [];
  if (prevEntries.length) {
    const prevId = prevEntries[0].id;
    const undoneParams: Record<string, any> = { pid: prevId };
    const undoneTypes: Record<string, any> = { pid: VARCHAR };
    let undoneWs = '';
    if (wsId) {
      undoneWs = ' AND t.workspace_id = $ws';
      undoneParams.ws = wsId;
      undoneTypes.ws = VARCHAR;
    } else {
      undoneWs = ' AND t.workspace_id IS NULL';
    }
    const undone = await queryAll(`
      SELECT l.target_id, t.title, t.id
      FROM links l
      JOIN tasks t ON t.id = l.target_id
      WHERE l.source_type = 'diary' AND l.source_id = $pid AND l.target_type = 'task' AND t.completed = false${undoneWs}
    `, undoneParams, undoneTypes);

    if (undone.length) {
      // Batch insert all carry-forward links in one query.
      // Bound list parameter rather than interpolated IDs with hand-rolled quote escaping, and
      // guarded by NOT EXISTS so a duplicate POST for the same date cannot double-link. (Two
      // concurrent POSTs can still create two diary_entries rows for one date — that needs a
      // uniqueness constraint on (entry_date, workspace_id); tracked in the plan's out-of-scope list.)
      await queryAll(
        `INSERT INTO links (id, source_type, source_id, target_type, target_id)
         SELECT uuid()::VARCHAR, 'diary', $did, 'task', tid
         FROM unnest($tids) AS u(tid)
         WHERE NOT EXISTS (
           SELECT 1 FROM links l
           WHERE l.source_type = 'diary' AND l.source_id = $did
             AND l.target_type = 'task' AND l.target_id = u.tid
         )`,
        { did: String(newEntry.id), tids: listValue(undone.map((t: any) => String(t.target_id))) },
        { did: VARCHAR, tids: LIST(VARCHAR) }
      ).catch(() => {});

      for (const task of undone) {
        carriedTasks.push({ id: task.target_id, title: task.title });
      }
    }
  }

  // Fetch links — workspace-scoped to match the new entry
  const linksReadParams: Record<string, any> = { id: newEntry.id };
  const linksReadTypes: Record<string, any> = { id: VARCHAR };
  let wsMatch = '';
  if (wsId) {
    wsMatch = `AND (
      (l.target_type = 'task' AND t.workspace_id = $ws)
      OR (l.target_type = 'note' AND n.workspace_id = $ws)
    )`;
    linksReadParams.ws = wsId;
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

  // Hydrate here too. This is the create-on-first-visit path, so without it the very first visit to
  // a new day would keep the N+1 that item 1 removes from the GET.
  const tasks = await hydrateTasksByIds(taskIdsFromLinks(links));

  setResponseStatus(event, 201);
  return { ...newEntry, links, tasks, carried_tasks: carriedTasks };
});
