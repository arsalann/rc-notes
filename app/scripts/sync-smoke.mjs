#!/usr/bin/env node
// Checks the offline-sync endpoints (`/api/sync/push`, `/api/sync/pull`) and the sync triggers
// against a LOCAL throwaway server (ios/scripts/test-server.sh), as master_tester.
//
//   node app/scripts/sync-smoke.mjs [baseURL]     default http://127.0.0.1:3457
//
// Refuses non-local hosts: it creates and edits data.
import { randomUUID } from 'node:crypto';

const base = process.argv[2] || 'http://127.0.0.1:3457';
const host = new URL(base).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.error(`refusing to run against ${host}: this script writes data. Use the local test server.`);
  process.exit(2);
}

const DEVICE = `smoke-device-${Date.now()}`;
const tag = `MasterTester_sync_${Date.now()}`;
let cookie = '';
let failures = 0;

async function call(method, path, body, { ua = 'daybook-ios/1.0', headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json', 'user-agent': ua, 'x-daybook-device': DEVICE,
      ...(cookie ? { cookie } : {}), ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data };
}

function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : `  → ${detail}`}`);
  if (!ok) failures++;
}

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const op = (method, path, body, clientTime = new Date().toISOString(), id = randomUUID()) =>
  ({ id, client_time: clientTime, method, path, body });

async function pullAll(since = 0) {
  const merged = {};
  const tombstones = [];
  let cursor = since;
  for (;;) {
    const { data } = await call('GET', `/api/sync/pull?since=${cursor}&limit=50`);
    for (const [table, rows] of Object.entries(data.rows)) (merged[table] ||= []).push(...rows);
    tombstones.push(...data.tombstones);
    cursor = data.cursor;
    if (!data.more) break;
  }
  return { rows: merged, tombstones, cursor };
}

const login = await call('POST', '/api/auth/login', { username: 'master_tester', password: 'password123' });
check('login as master_tester', login.status === 200, JSON.stringify(login.data));

// --- Full pull: every synced table, sync columns present, field_clock hidden.
const first = await pullAll(0);
check('pull returns every synced table',
  ['workspaces', 'tasks', 'notes', 'links', 'diary_entries', 'goals_weekly'].every(t => Array.isArray(first.rows[t])));
const ws = first.rows.workspaces[0];
check('rows carry sync_seq and leave out bookkeeping', ws && typeof ws.sync_seq === 'number' && !('field_clock' in ws) && !('updated_device_id' in ws));
const work = first.rows.workspaces.find(w => w.name === 'Work');

// --- Push: create a task offline (client id + device time), then edit it.
const taskId = randomUUID();
const createdAt = ago(30);
const push1 = await call('POST', '/api/sync/push', { ops: [
  op('POST', '/api/tasks', { id: taskId, title: `${tag}_task`, workspace_id: work.id }, createdAt),
  op('PUT', `/api/tasks/${taskId}`, { title: `${tag}_task_v2` }, ago(29)),
] });
check('push applies a batch', push1.status === 200 && push1.data.results.every(r => r.status < 300), JSON.stringify(push1.data));

const afterCreate = await pullAll(first.cursor);
check('pull since cursor returns the new task', afterCreate.rows.tasks.some(t => t.id === taskId));
const task = (await call('GET', `/api/tasks/${taskId}`)).data;
check('device metadata is stamped',
  task?.created_device_kind === 'ios' && task?.created_device_id === DEVICE && task?.updated_device_id === DEVICE
    && task?.updated_by === 'user_in_ios_app' && task?.sync_op_id === push1.data.results[1].id,
  JSON.stringify({ k: task?.created_device_kind, d: task?.created_device_id, by: task?.updated_by, op: task?.sync_op_id }));
check('client_updated_at is the device time of the last edit',
  task?.client_updated_at?.startsWith(ago(29).slice(0, 16).replace('T', ' ')), task?.client_updated_at);
check('the queued title edit applied', task?.title === `${tag}_task_v2`);

// --- Replay: the same op id twice changes nothing and returns the stored result.
const replayOp = op('PUT', `/api/tasks/${taskId}`, { priority: 3 }, ago(20));
const r1 = await call('POST', '/api/sync/push', { ops: [replayOp] });
const r2 = await call('POST', '/api/sync/push', { ops: [replayOp] });
check('a repeated op id is not applied again', r2.data.results[0].replayed === true && r2.data.results[0].status === r1.data.results[0].status);

// --- Last writer wins, per field: the browser edits the title now; an older queued phone edit of the
// title loses, while its priority edit (a field nobody else touched) applies.
await call('PUT', `/api/tasks/${taskId}`, { title: `${tag}_browser_title` }, { ua: 'Mozilla/5.0 smoke' });
const stale = await call('POST', '/api/sync/push', { ops: [
  op('PUT', `/api/tasks/${taskId}`, { title: `${tag}_stale_phone_title`, priority: 1 }, ago(10)),
] });
check('stale push still succeeds', stale.data.results[0].status === 200, JSON.stringify(stale.data));
let current = (await call('GET', `/api/tasks/${taskId}`)).data;
check('newer browser title kept over an older phone edit', current.title === `${tag}_browser_title`, current.title);
check('older phone edit of an untouched field applied', current.priority === 1, String(current.priority));

// A phone edit made after the browser's wins.
await call('POST', '/api/sync/push', { ops: [op('PUT', `/api/tasks/${taskId}`, { title: `${tag}_newest_phone_title` })] });
current = (await call('GET', `/api/tasks/${taskId}`)).data;
check('newer phone edit wins', current.title === `${tag}_newest_phone_title`, current.title);

// A device clock in the future is capped at the receive time, so it cannot win forever.
await call('POST', '/api/sync/push', { ops: [op('PUT', `/api/tasks/${taskId}`, { description: 'future' }, new Date(Date.now() + 86_400_000).toISOString())] });
await call('PUT', `/api/tasks/${taskId}`, { description: 'browser after future' }, { ua: 'Mozilla/5.0 smoke' });
current = (await call('GET', `/api/tasks/${taskId}`)).data;
check('future device clock is capped', current.description === 'browser after future', current.description);

// Status, completed and completed_at move together.
await call('PATCH', `/api/tasks/${taskId}/complete`, { completed: true }, { ua: 'Mozilla/5.0 smoke' });
await call('POST', '/api/sync/push', { ops: [op('PUT', `/api/tasks/${taskId}`, { status: 'now' }, ago(5))] });
current = (await call('GET', `/api/tasks/${taskId}`)).data;
check('stale status edit does not split status from completed', current.status === 'done' && current.completed === true,
  JSON.stringify({ s: current.status, c: current.completed }));

// --- Notes and links with client ids; deleting a link leaves a tombstone.
const noteId = randomUUID();
const linkId = randomUUID();
const push2 = await call('POST', '/api/sync/push', { ops: [
  op('POST', '/api/notes', { id: noteId, title: `${tag}_note`, workspace_id: work.id }),
  op('POST', '/api/links', { id: linkId, source_type: 'task', source_id: taskId, target_type: 'note', target_id: noteId }),
  op('POST', '/api/notes', { id: noteId, title: `${tag}_note_dup` }),
] });
check('note + link created with client ids', push2.data.results[0].body?.id === noteId && push2.data.results[1].body?.id === linkId,
  JSON.stringify(push2.data.results.map(r => r.body?.id)));
check('a second create with the same note id returns the first', push2.data.results[2].body?.title === `${tag}_note`);

// --- Diary pages: the id comes from date + workspace, so an offline page and an online one match.
const day = '2031-03-04';
const pushDiary = await call('POST', '/api/sync/push', { ops: [op('POST', '/api/diary', { entry_date: day, workspace_id: work.id })] });
const online = await call('POST', '/api/diary', { entry_date: day, workspace_id: work.id }, { ua: 'Mozilla/5.0 smoke' });
check('diary page id is the same online and offline', pushDiary.data.results[0].body?.id === online.data.id,
  `${pushDiary.data.results[0].body?.id} vs ${online.data.id}`);

// Journal compare-and-swap still holds through the queue.
const entry = online.data;
const save = await call('POST', '/api/sync/push', { ops: [
  op('PUT', `/api/diary/${day}`, { entry_id: entry.id, workspace_id: work.id, content: 'phone writing', expected_updated_at: entry.updated_at }),
  op('PUT', `/api/diary/${day}`, { entry_id: entry.id, workspace_id: work.id, content: 'stale writing', expected_updated_at: entry.updated_at }),
] });
check('journal save through the queue', save.data.results[0].status === 200, JSON.stringify(save.data.results[0]));
check('a save based on an old revision is a 409 conflict', save.data.results[1].status === 409);
check('journal provenance comes from the device', save.data.results[0].body?.updated_by === 'user_in_ios_app', save.data.results[0].body?.updated_by);

// Day-page visit (GET) is allowed and returns no body.
const visit = await call('POST', '/api/sync/push', { ops: [op('GET', `/api/diary/${day}?workspace_id=${work.id}`)] });
check('day visit runs without returning the page', visit.data.results[0].status === 200 && visit.data.results[0].body === null);

// --- Disallowed routes and bad input.
const bad = await call('POST', '/api/sync/push', { ops: [op('POST', '/api/users', { username: 'x', password: 'yyyyyyyy' })] });
check('auth/admin routes are refused inside a batch', bad.data.results[0].status === 400);
const noId = await call('POST', '/api/sync/push', { ops: [{ method: 'POST', path: '/api/tasks', body: { title: 'x' } }] });
check('ops without a UUID are rejected', noId.status === 400);

// Tombstones: removing the task's due date deletes its diary links.
await call('PUT', `/api/tasks/${taskId}`, { due_at: `${day}T09:00:00.000Z` }, { ua: 'Mozilla/5.0 smoke' });
const beforeClear = await pullAll(0);
const dayLinks = beforeClear.rows.links.filter(l => l.target_id === taskId && l.source_type === 'diary').map(l => l.id);
await call('PUT', `/api/tasks/${taskId}`, { due_at: null }, { ua: 'Mozilla/5.0 smoke' });
const afterClear = await pullAll(beforeClear.cursor);
check('deleted links come back as tombstones',
  dayLinks.length > 0 && dayLinks.every(id => afterClear.tombstones.some(t => t.table_name === 'links' && t.row_id === id)),
  JSON.stringify({ dayLinks, tombstones: afterClear.tombstones }));

// Event log records the replayed ops with their op id and device.
const events = (await call('GET', '/api/events?limit=200')).data;
const logged = events.find(e => e.sync_op_id === push1.data.results[0].id);
check('replayed ops are in the event log with op id and device', logged?.device_id === DEVICE && logged?.path === '/api/tasks',
  JSON.stringify(logged && { d: logged.device_id, p: logged.path }));

// Signed-out pushes are refused.
cookie = '';
const anon = await call('POST', '/api/sync/push', { ops: [op('POST', '/api/tasks', { title: 'x' })] });
check('push requires a session', anon.status === 401);

console.log(failures ? `\n${failures} sync check(s) failed` : '\nall sync checks passed');
process.exit(failures ? 1 : 0);
