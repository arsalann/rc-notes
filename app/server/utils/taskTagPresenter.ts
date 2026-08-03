import { VARCHAR } from '@duckdb/node-api';
import { resolveTaskTags, type ResolvedTaskTag } from '~/utils/taskTags';
import { queryAll } from './db';

export interface TaskTagPresentation {
  detected_tags: ResolvedTaskTag[];
  resolved_tags: ResolvedTaskTag[];
}

type TaskTaggableRow = Record<string, any> & {
  title?: string | null;
  tags?: unknown;
  parent_id?: string | null;
  parent_title?: string | null;
};

function manualTagsFrom(row: TaskTaggableRow): string[] {
  return Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
}

export function withDerivedTaskTags<T extends TaskTaggableRow>(
  row: T,
  parentTitle?: string | null,
): T & TaskTagPresentation {
  const resolvedParentTitle = parentTitle !== undefined ? parentTitle : row.parent_title;
  return {
    ...row,
    ...resolveTaskTags({
      title: row.title,
      parentTitle: resolvedParentTitle,
      manualTags: manualTagsFrom(row),
    }),
  };
}

/**
 * Decorates mutation results, whose RETURNING rows do not include a joined
 * parent title. Read endpoints should pass their joined parent title directly.
 */
export async function withStoredTaskTags<T extends TaskTaggableRow>(row: T): Promise<T & TaskTagPresentation> {
  if (!row.parent_id) return withDerivedTaskTags(row, null);

  const parents = await queryAll(
    'SELECT title FROM tasks WHERE id = $id',
    { id: String(row.parent_id) },
    { id: VARCHAR },
  );
  return withDerivedTaskTags(row, (parents[0]?.title as string | null | undefined) ?? null);
}
