import { queryAll } from '~/server/utils/db';
import { hydrateTasksByIds } from '~/server/utils/taskHydration';
import { listValue, LIST, VARCHAR } from '@duckdb/node-api';

export default defineEventHandler(async (event) => {
  const date = String(getRouterParam(event, 'date'));
  const { workspace_id } = getQuery(event);
  const requestedWorkspaceId = workspace_id ? String(workspace_id) : null;

  let where = "entry_date = $date::DATE";
  const params: Record<string, any> = { date };
  const types: Record<string, any> = { date: VARCHAR };

  if (requestedWorkspaceId) {
    where += " AND workspace_id = $ws";
    params.ws = requestedWorkspaceId;
    types.ws = VARCHAR;
  }

  const rows = await queryAll(`SELECT * FROM diary_entries WHERE ${where}`, params, types);
  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'No entry for this date' });
  }

  const entry = rows[0];
  // With "All" selected there can be one diary entry per workspace. The selected entry is
  // still used for the journal text, but task links must be read across every entry for the date.

  // NOTE: this handler used to "auto-bump" every overdue task in the workspace to the requested
  // date. That made a read mutate unrelated rows: navigating to a future date (one tap on "next
  // day") rewrote due_at across the entire incomplete backlog. Removed deliberately.
  //
  // Nothing is lost in the UI — what appears on a day is driven by diary→task *links*, not by
  // due_at, so a carried-forward task still shows on this page. It now reads as overdue, which is
  // the truth. See .context/perf-plan.md item 0.

  // Batch-create diary links for every task due on this date (same workspace only)
  const linkParams: Record<string, any> = { did: entry.id as string, date };
  const linkTypes: Record<string, any> = { did: VARCHAR, date: VARCHAR };
  let linkWs = '';
  if (requestedWorkspaceId) {
    linkWs = ' AND t.workspace_id = $ws';
    linkParams.ws = requestedWorkspaceId;
    linkTypes.ws = VARCHAR;
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

  // If a page was created before its preceding page finished carrying tasks (rapid navigation can
  // overlap requests), repair the empty page from the latest earlier page in the same workspace.
  // This is intentionally limited to pages with no task links, so it never overwrites a page that
  // already has its own task list.
  const carryWorkspaceId = entry.workspace_id ? String(entry.workspace_id) : null;
  if (carryWorkspaceId) {
    await queryAll(
      `INSERT INTO links (id, user_id, source_type, source_id, target_type, target_id, updated_by)
       SELECT uuid()::VARCHAR, $user_id, 'diary', $target_id, 'task', previous_links.target_id, 'user_in_app'
       FROM links previous_links
       JOIN tasks previous_tasks ON previous_tasks.id = previous_links.target_id
       WHERE previous_links.source_type = 'diary'
         AND previous_links.source_id = (
           SELECT previous.id
           FROM diary_entries previous
           WHERE previous.workspace_id = $workspace_id
             AND previous.entry_date < $date::DATE
             AND previous.deleted_at IS NULL
             AND EXISTS (
               SELECT 1
               FROM links previous_page_links
               JOIN tasks previous_page_tasks ON previous_page_tasks.id = previous_page_links.target_id
               WHERE previous_page_links.source_type = 'diary'
                 AND previous_page_links.source_id = previous.id
                 AND previous_page_links.target_type = 'task'
                 AND previous_page_tasks.completed = false
             )
           ORDER BY previous.entry_date DESC
           LIMIT 1
         )
         AND previous_links.target_type = 'task'
         AND previous_tasks.completed = false
         AND NOT EXISTS (
           SELECT 1 FROM links current_page_links
           WHERE current_page_links.source_type = 'diary'
             AND current_page_links.source_id = $target_id
             AND current_page_links.target_type = 'task'
         )
         AND NOT EXISTS (
           SELECT 1 FROM links duplicate_links
           WHERE duplicate_links.source_type = 'diary'
             AND duplicate_links.source_id = $target_id
             AND duplicate_links.target_type = 'task'
             AND duplicate_links.target_id = previous_links.target_id
         )`,
      {
        target_id: String(entry.id),
        user_id: entry.user_id ? String(entry.user_id) : null,
        workspace_id: carryWorkspaceId,
        date,
      },
      { target_id: VARCHAR, user_id: VARCHAR, workspace_id: VARCHAR, date: VARCHAR }
    ).catch(() => {});
  }

  // Fetch linked items — task/note workspace must match this entry's workspace
  const linksReadParams: Record<string, any> = { id: entry.id };
  const linksReadTypes: Record<string, any> = { id: VARCHAR };
  const sourceFilter = requestedWorkspaceId
    ? 'l.source_id = $id'
    : 'l.source_id IN (SELECT id FROM diary_entries WHERE entry_date = $date::DATE)';
  if (!requestedWorkspaceId) {
    linksReadParams.date = date;
    linksReadTypes.date = VARCHAR;
  }
  let wsMatch = '';
  if (requestedWorkspaceId) {
    wsMatch = `AND (
      (l.target_type = 'task' AND t.workspace_id = $ws)
      OR (l.target_type = 'note' AND n.workspace_id = $ws)
    )`;
    linksReadParams.ws = requestedWorkspaceId;
    linksReadTypes.ws = VARCHAR;
  }
  const links = await queryAll(`
    SELECT l.id as link_id, l.target_type, l.target_id,
      COALESCE(t.title, n.title) as target_title
    FROM links l
    LEFT JOIN tasks t ON l.target_type = 'task' AND t.id = l.target_id
    LEFT JOIN notes n ON l.target_type = 'note' AND n.id = l.target_id
    WHERE l.source_type = 'diary' AND ${sourceFilter} ${wsMatch}
  `, linksReadParams, linksReadTypes);

  // Batch auto-set due_at on linked tasks that don't have one yet.
  // Bound list parameter rather than interpolated IDs — see plan item 5's note on that pattern.
  const taskLinkIds = links.filter((l: any) => l.target_type === 'task').map((l: any) => String(l.target_id));
  if (taskLinkIds.length) {
    await queryAll(
      `UPDATE tasks SET due_at = $due_at::TIMESTAMP, updated_at = now()
       WHERE list_contains($ids, id) AND due_at IS NULL`,
      { due_at: `${date}T12:00:00`, ids: listValue(taskLinkIds) },
      { due_at: VARCHAR, ids: LIST(VARCHAR) }
    ).catch(() => {});
  }

  // Hydrate the linked tasks here rather than letting the client fetch them one at a time.
  // Two queries instead of ~114 round trips. See .context/perf-plan.md item 1.
  const tasks = await hydrateTasksByIds(taskLinkIds);

  return { ...entry, links, tasks };
});
