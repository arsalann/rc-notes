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
  } else {
    where += " AND workspace_id IS NULL";
  }

  const existing = await queryAll(`SELECT * FROM diary_entries WHERE ${where}`, params, types);
  if (existing.length) return existing[0];

  // Create new entry
  const cols = ['id', 'entry_date', 'content'];
  const vals = ['uuid()::VARCHAR', '$date::DATE', '$content'];
  const insertParams: Record<string, any> = { date: entryDate, content };
  const insertTypes: Record<string, any> = { date: VARCHAR, content: VARCHAR };

  if (workspaceId) {
    cols.push('workspace_id');
    vals.push('$ws');
    insertParams.ws = workspaceId;
    insertTypes.ws = VARCHAR;
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
  } else {
    prevWhere += " AND workspace_id IS NULL";
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

    for (const task of undone) {
      // Create link from new entry to undone task
      await queryAll(
        "INSERT INTO links (id, source_type, source_id, target_type, target_id) VALUES (uuid()::VARCHAR, 'diary', $sid, 'task', $tid) RETURNING *",
        { sid: newEntry.id, tid: task.target_id },
        { sid: VARCHAR, tid: VARCHAR }
      );
      carriedTasks.push({ id: task.target_id, title: task.title });
    }
  }

  setResponseStatus(event, 201);
  return { ...newEntry, carried_tasks: carriedTasks };
});
