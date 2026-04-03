import { queryAll } from './db';
import { VARCHAR } from '@duckdb/node-api';

/**
 * Maps HTTP method + path pattern to a human-readable event type.
 */
function resolveEventType(method: string, path: string): string {
  const m = method.toUpperCase();
  const p = path.replace(/\/api\//, '');

  // Tasks
  if (p.match(/^tasks$/) && m === 'GET') return 'task.list';
  if (p.match(/^tasks$/) && m === 'POST') return 'task.create';
  if (p.match(/^tasks\/[^/]+$/) && m === 'GET') return 'task.view';
  if (p.match(/^tasks\/[^/]+$/) && m === 'PUT') return 'task.update';
  if (p.match(/^tasks\/[^/]+$/) && m === 'DELETE') return 'task.delete';
  if (p.match(/^tasks\/[^/]+\/complete$/)) return 'task.toggle_complete';
  if (p.match(/^tasks\/[^/]+\/pin$/)) return 'task.toggle_pin';
  if (p.match(/^tasks\/[^/]+\/archive$/)) return 'task.toggle_archive';

  // Notes
  if (p.match(/^notes$/) && m === 'GET') return 'note.list';
  if (p.match(/^notes$/) && m === 'POST') return 'note.create';
  if (p.match(/^notes\/[^/]+$/) && m === 'GET') return 'note.view';
  if (p.match(/^notes\/[^/]+$/) && m === 'PUT') return 'note.update';
  if (p.match(/^notes\/[^/]+$/) && m === 'DELETE') return 'note.delete';
  if (p.match(/^notes\/[^/]+\/pin$/)) return 'note.toggle_pin';

  // Diary
  if (p.match(/^diary$/) && m === 'POST') return 'diary.create';
  if (p.match(/^diary\/[^/]+$/) && m === 'GET') return 'diary.view';
  if (p.match(/^diary\/[^/]+$/) && m === 'PUT') return 'diary.update';

  // Links
  if (p.match(/^links$/) && m === 'POST') return 'link.create';
  if (p.match(/^task-links\//)) return 'task_links.view';

  // Search & mention
  if (p.match(/^search$/)) return 'search';
  if (p.match(/^mention$/)) return 'mention';

  // Calendar
  if (p.match(/^calendar$/)) return 'calendar.view';

  // Workspaces
  if (p.match(/^workspaces$/) && m === 'GET') return 'workspace.list';
  if (p.match(/^workspaces$/) && m === 'POST') return 'workspace.create';

  // Stats
  if (p.match(/^stats$/)) return 'stats.view';

  return `${m.toLowerCase()}.${p.replace(/\//g, '.')}`;
}

/**
 * Extract entity type and ID from the path.
 */
function resolveEntity(path: string): { entity_type: string | null; entity_id: string | null } {
  const p = path.replace(/\/api\//, '');

  const taskMatch = p.match(/^tasks\/([^/]+)/);
  if (taskMatch) return { entity_type: 'task', entity_id: taskMatch[1] };

  const noteMatch = p.match(/^notes\/([^/]+)/);
  if (noteMatch) return { entity_type: 'note', entity_id: noteMatch[1] };

  const diaryMatch = p.match(/^diary\/([^/]+)/);
  if (diaryMatch) return { entity_type: 'diary', entity_id: diaryMatch[1] };

  const taskLinksMatch = p.match(/^task-links\/([^/]+)/);
  if (taskLinksMatch) return { entity_type: 'task', entity_id: taskLinksMatch[1] };

  return { entity_type: null, entity_id: null };
}

export async function logEvent(opts: {
  method: string;
  path: string;
  workspace_id?: string | null;
  metadata?: Record<string, any>;
  user_agent?: string;
}) {
  try {
    const eventType = resolveEventType(opts.method, opts.path);
    const { entity_type, entity_id } = resolveEntity(opts.path);
    const metadata = opts.metadata ? JSON.stringify(opts.metadata) : '{}';

    await queryAll(
      `INSERT INTO event_log (id, event_type, method, path, entity_type, entity_id, workspace_id, metadata, user_agent)
       VALUES (uuid()::VARCHAR, $event_type, $method, $path, $entity_type, $entity_id, $workspace_id, $metadata, $user_agent)
       RETURNING id`,
      {
        event_type: eventType,
        method: opts.method.toUpperCase(),
        path: opts.path,
        entity_type: entity_type || '',
        entity_id: entity_id || '',
        workspace_id: opts.workspace_id || '',
        metadata,
        user_agent: opts.user_agent || '',
      },
      {
        event_type: VARCHAR, method: VARCHAR, path: VARCHAR,
        entity_type: VARCHAR, entity_id: VARCHAR, workspace_id: VARCHAR,
        metadata: VARCHAR, user_agent: VARCHAR,
      }
    );
  } catch {
    // Never let logging errors break the app
  }
}
