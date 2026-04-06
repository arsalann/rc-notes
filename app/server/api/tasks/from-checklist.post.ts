import { queryAll } from '~/server/utils/db';
import { generateTaskDisplayId, generateSubtaskDisplayId } from '~/server/utils/ids';
import { listValue, VARCHAR, LIST, INTEGER } from '@duckdb/node-api';

interface ChecklistItem {
  title: string;
  checked: boolean;
  children: ChecklistItem[];
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const items: ChecklistItem[] = body.items;
  const sourceType: string = body.source_type; // 'note' or 'diary'
  const sourceId: string = body.source_id;
  const workspaceId: string | null = body.workspace_id || null;

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

    const status = item.checked ? 'done' : 'next';
    const cols = ['id', 'title', 'completed', 'status', 'tags', 'position', 'display_id'];
    const vals = ['uuid()::VARCHAR', '$title', '$completed', '$status', '$tags', '$position', '$display_id'];
    const params: Record<string, any> = {
      title: item.title,
      completed: item.checked,
      status,
      tags: listValue([]),
      position,
      display_id: displayId,
    };
    const types: Record<string, any> = {
      title: VARCHAR,
      completed: VARCHAR, // DuckDB casts
      status: VARCHAR,
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

      const subStatus = child.checked ? 'done' : 'next';
      const subCols = ['id', 'title', 'completed', 'status', 'parent_id', 'tags', 'position', 'display_id'];
      const subVals = ['uuid()::VARCHAR', '$title', '$completed', '$subStatus', '$parent_id', '$tags', '$position', '$display_id'];
      const subParams: Record<string, any> = {
        title: child.title,
        completed: child.checked,
        subStatus,
        parent_id: parentTask.id,
        tags: listValue([]),
        position: i,
        display_id: subDisplayId,
      };
      const subTypes: Record<string, any> = {
        title: VARCHAR,
        completed: VARCHAR,
        subStatus: VARCHAR,
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
