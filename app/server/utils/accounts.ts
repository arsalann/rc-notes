import { createError } from 'h3';
import { queryAll, withTransaction } from './db';
import { VARCHAR } from './sqlTypes';

/**
 * Delete a user and everything they own. Content goes first in one statement; deleting synced rows
 * leaves tombstones (with a copy of the row), so those are removed afterwards together with the
 * sync ledger, the audit log and the user row. Both statements share a transaction, so a
 * failure restores all content, tombstones and the account together.
 *
 * Inside the user's own request row level security limits it to their rows; an admin deleting
 * someone else calls it through `asSystem`.
 */
export async function deleteUserAndData(userId: string) {
  return withTransaction(async () => {
    // Serialize self/admin deletions so two admins cannot both pass the last-admin check.
    await queryAll('SELECT pg_advisory_xact_lock(77102765)');
    const account = (await queryAll('SELECT is_admin FROM users WHERE id = $id', { id: userId }, { id: VARCHAR }))[0];
    if (!account) throw createError({ statusCode: 404, statusMessage: 'User not found' });
    if (account.is_admin) {
      const others = await queryAll(
        'SELECT count(*)::int AS n FROM users WHERE is_admin AND id <> $id AND password_hash IS NOT NULL',
        { id: userId }, { id: VARCHAR },
      );
      if (!others[0]?.n) throw createError({ statusCode: 409, statusMessage: 'You are the only admin. Make someone else an admin first.' });
    }
    const p = { id: userId };
    const t = { id: VARCHAR };
    await queryAll(
      `WITH l AS (DELETE FROM links WHERE user_id = $id),
            ta AS (DELETE FROM tasks WHERE user_id = $id),
            n AS (DELETE FROM notes WHERE user_id = $id),
            d AS (DELETE FROM diary_entries WHERE user_id = $id),
            g AS (DELETE FROM goals_weekly WHERE user_id = $id),
            w AS (DELETE FROM workspaces WHERE user_id = $id),
            tt AS (DELETE FROM task_templates WHERE user_id = $id)
       DELETE FROM tag_settings WHERE user_id = $id`,
      p, t,
    );
    await queryAll(
      `WITH st AS (DELETE FROM sync_tombstones WHERE user_id = $id),
            so AS (DELETE FROM sync_ops WHERE user_id = $id),
            e AS (DELETE FROM event_log WHERE user_id = $id)
       DELETE FROM users WHERE id = $id`,
      p, t,
    );
  });
}
