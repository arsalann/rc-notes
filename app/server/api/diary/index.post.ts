import { queryAll } from '~/server/utils/db';
import { VARCHAR } from '@duckdb/node-api';

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
    const undone = await queryAll(`
      SELECT l.target_id, t.title, t.id
      FROM links l
      JOIN tasks t ON t.id = l.target_id
      WHERE l.source_type = 'diary' AND l.source_id = $pid AND l.target_type = 'task' AND t.completed = false
    `, { pid: prevId }, { pid: VARCHAR });

    if (undone.length) {
      // Batch insert all carry-forward links in one query
      const valuesClauses = undone.map((task: any) =>
        `(uuid()::VARCHAR, 'diary', '${(newEntry.id as string).replace(/'/g, "''")}', 'task', '${(task.target_id as string).replace(/'/g, "''")}')`
      ).join(', ');
      await queryAll(
        `INSERT INTO links (id, source_type, source_id, target_type, target_id) VALUES ${valuesClauses}`
      ).catch(() => {});

      for (const task of undone) {
        carriedTasks.push({ id: task.target_id, title: task.title });
      }
    }
  }

  // Fetch links so the client doesn't need a follow-up GET
  const links = await queryAll(`
    SELECT l.id as link_id, l.target_type, l.target_id,
      COALESCE(t.title, n.title) as target_title
    FROM links l
    LEFT JOIN tasks t ON l.target_type = 'task' AND t.id = l.target_id
    LEFT JOIN notes n ON l.target_type = 'note' AND n.id = l.target_id
    WHERE l.source_type = 'diary' AND l.source_id = $id
  `, { id: newEntry.id }, { id: VARCHAR });

  setResponseStatus(event, 201);
  return { ...newEntry, links, carried_tasks: carriedTasks };
});
