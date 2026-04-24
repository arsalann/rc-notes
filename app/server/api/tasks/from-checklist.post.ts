import { queryAll, getDefaultWorkspaceId } from '~/server/utils/db';
import { generateTaskDisplayId, generateSubtaskDisplayId } from '~/server/utils/ids';
import { listValue, VARCHAR, LIST, INTEGER } from '@duckdb/node-api';

interface ChecklistItem {
  title: string;
  checked: boolean;
  children: ChecklistItem[];
  tags?: string[];
  priority?: number;
  status?: string;
  due_at?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const items: ChecklistItem[] = body.items;
  const sourceType: string = body.source_type; // 'note' or 'diary'
  const sourceId: string = body.source_id;
  const workspaceId: string | null = body.workspace_id || await getDefaultWorkspaceId();
  const dueDate: string | null = body.due_date || null;

  if (!items?.length) throw createError({ statusCode: 400, statusMessage: 'No checklist items' });
  if (!sourceType || !sourceId) throw createError({ statusCode: 400, statusMessage: 'Source is required' });

  const createdTasks: any[] = [];

  for (const item of items) {
    // Create parent task
    const displayId = await generateTaskDisplayId(item.title, []);

    const posRows = await queryAll(
      'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM tasks WHERE parent_id IS NULL',
      {}, undefined
    );
    const position = posRows[0]?.next_pos ?? 0;

    const itemStatus = ['next', 'now', 'done'].includes(item.status || '')
      ? item.status!
      : (item.checked ? 'done' : (dueDate || item.due_at ? 'now' : 'next'));
    const itemPriority = [0, 1, 2, 3].includes(Number(item.priority)) ? Number(item.priority) : 2;
    const itemTags = Array.isArray(item.tags) ? item.tags.filter((t: any) => typeof t === 'string' && t.trim()) : [];
    const cols = ['id', 'title', 'completed', 'status', 'priority', 'tags', 'position', 'display_id'];
    const vals = ['uuid()::VARCHAR', '$title', '$completed', '$status', '$priority', '$tags', '$position', '$display_id'];
    const params: Record<string, any> = {
      title: item.title,
      completed: String(item.checked),
      status: itemStatus,
      priority: itemPriority,
      tags: listValue(itemTags),
      position,
      display_id: displayId,
    };
    const types: Record<string, any> = {
      title: VARCHAR,
      completed: VARCHAR, // DuckDB casts
      status: VARCHAR,
      priority: INTEGER,
      tags: LIST(VARCHAR),
      position: INTEGER,
      display_id: VARCHAR,
    };

    if (workspaceId) {
      cols.push('workspace_id');
      vals.push('$workspace_id');
      params.workspace_id = workspaceId;
      types.workspace_id = VARCHAR;
    }

    const itemDue = item.due_at || (dueDate ? `${dueDate}T12:00:00` : null);
    if (itemDue) {
      cols.push('due_at');
      vals.push('$due_date::TIMESTAMP');
      params.due_date = itemDue;
      types.due_date = VARCHAR;
    }

    if (item.checked) {
      cols.push('completed_at');
      vals.push('now()');
    }

    const parentRows = await queryAll(
      `INSERT INTO tasks (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`,
      params, types
    );
    const parentTask = parentRows[0];
    createdTasks.push(parentTask);

    // Create link from source to this task
    await queryAll(
      `INSERT INTO links (id, source_type, source_id, target_type, target_id)
       SELECT uuid()::VARCHAR, $st, $si, 'task', $ti
       WHERE NOT EXISTS (
         SELECT 1 FROM links WHERE source_type = $st AND source_id = $si AND target_type = 'task' AND target_id = $ti
       )`,
      { st: sourceType, si: sourceId, ti: parentTask.id },
      { st: VARCHAR, si: VARCHAR, ti: VARCHAR }
    );

    // Create subtasks
    for (let i = 0; i < item.children.length; i++) {
      const child = item.children[i];
      const subDisplayId = await generateSubtaskDisplayId(displayId, parentTask.id);

      const subStatus = ['next', 'now', 'done'].includes(child.status || '')
        ? child.status!
        : (child.checked ? 'done' : 'next');
      const subPriority = [0, 1, 2, 3].includes(Number(child.priority)) ? Number(child.priority) : 2;
      const subTags = Array.isArray(child.tags) ? child.tags.filter((t: any) => typeof t === 'string' && t.trim()) : [];
      const subCols = ['id', 'title', 'completed', 'status', 'priority', 'parent_id', 'tags', 'position', 'display_id'];
      const subVals = ['uuid()::VARCHAR', '$title', '$completed', '$subStatus', '$subPriority', '$parent_id', '$tags', '$position', '$display_id'];
      const subParams: Record<string, any> = {
        title: child.title,
        completed: String(child.checked),
        subStatus,
        subPriority,
        parent_id: parentTask.id,
        tags: listValue(subTags),
        position: i,
        display_id: subDisplayId,
      };
      const subTypes: Record<string, any> = {
        title: VARCHAR,
        completed: VARCHAR,
        subStatus: VARCHAR,
        subPriority: INTEGER,
        parent_id: VARCHAR,
        tags: LIST(VARCHAR),
        position: INTEGER,
        display_id: VARCHAR,
      };

      if (workspaceId) {
        subCols.push('workspace_id');
        subVals.push('$workspace_id');
        subParams.workspace_id = workspaceId;
        subTypes.workspace_id = VARCHAR;
      }

      if (child.checked) {
        subCols.push('completed_at');
        subVals.push('now()');
      }

      await queryAll(
        `INSERT INTO tasks (${subCols.join(', ')}) VALUES (${subVals.join(', ')}) RETURNING *`,
        subParams, subTypes
      );
    }
  }

  setResponseStatus(event, 201);
  return createdTasks;
});
