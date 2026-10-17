#!/usr/bin/env node
// Exercises every API route against a LOCAL throwaway server (ios/scripts/test-server.sh) as
// master_tester, and checks responses keep the shapes the iOS fixtures were captured from.
//
//   node app/scripts/api-smoke.mjs [baseURL]     default http://127.0.0.1:3457
//
// Refuses non-local hosts: it creates and edits data.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:3457';
const host = new URL(base).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.error(`refusing to run against ${host}: this script writes data. Use the local test server.`);
  process.exit(2);
}

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../ios/DaybookKit/Tests/DaybookKitTests/Fixtures');
const fixtures = Object.fromEntries(
  readdirSync(fixturesDir).filter(f => f.endsWith('.json')).map(f => [f.replace('.json', ''), JSON.parse(readFileSync(join(fixturesDir, f), 'utf8'))]),
);

let cookie = '';
let failures = 0;
const tag = `MasterTester_smoke_${Date.now()}`;

async function call(method, path, body, { expect = [200, 201], raw = false } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': 'daybook-smoke/1.0', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  const ok = expect.includes(res.status);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${res.status} ${method} ${path}${ok ? '' : `  → ${text.slice(0, 300)}`}`);
  if (!ok) failures++;
  return raw ? { status: res.status, data } : data;
}

const kind = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Compare key sets and value kinds against a captured fixture (nulls match anything). */
function sameShape(name, actual, expected, path = name) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return report(`${path}: expected array, got ${kind(actual)}`);
    if (expected.length && actual.length) sameShape(name, actual[0], expected[0], `${path}[0]`);
    return;
  }
  if (kind(expected) !== 'object' || kind(actual) !== 'object') {
    if (kind(expected) !== 'null' && kind(actual) !== 'null' && kind(expected) !== kind(actual)) {
      report(`${path}: expected ${kind(expected)}, got ${kind(actual)} (${JSON.stringify(actual)})`);
    }
    return;
  }
  for (const key of Object.keys(expected)) {
    if (!(key in actual)) { report(`${path}.${key}: missing`); continue; }
    sameShape(name, actual[key], expected[key], `${path}.${key}`);
  }
}
function report(msg) {
  failures++;
  console.log(`FAIL shape ${msg}`);
}

const today = new Date().toISOString().slice(0, 10);
const weekStart = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); })();
const plus = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

await call('GET', '/api/health');
await call('GET', '/api/setup/status');
await call('GET', '/api/setup/test');
await call('POST', '/api/auth/login', { username: 'master_tester', password: 'password123' });
sameShape('auth_check', await call('GET', '/api/auth/check'), fixtures.auth_check);

const workspaces = await call('GET', '/api/workspaces');
sameShape('workspaces', workspaces, fixtures.workspaces);
const work = workspaces.find(w => w.name === 'Work');
const ws = await call('POST', '/api/workspaces', { name: `${tag} ws`, emoji: '🧪' });

// Tasks
const parent = await call('POST', '/api/tasks', {
  id: crypto.randomUUID(), title: `${tag} parent`, workspace_id: work.id, tags: ['launch'], priority: 3, status: 'now',
  due_at: new Date().toISOString(),
});
await call('POST', '/api/tasks', { id: parent.id, title: `${tag} parent` }); // idempotent replay
const child = await call('POST', '/api/tasks', { title: `${tag} child`, parent_id: parent.id });
const list = await call('GET', `/api/tasks?workspace_id=${work.id}`);
sameShape('tasks_list', list, fixtures.tasks_list);
await call('GET', '/api/tasks?archived=true');
sameShape('task_detail', await call('GET', `/api/tasks/${parent.id}`), fixtures.task_detail);
await call('GET', `/api/tasks/batch?ids=${parent.id},${child.id}`);
await call('PUT', `/api/tasks/${parent.id}`, { title: `${tag} parent renamed`, description: 'd', due_at: `${plus(1)}T09:00:00.000Z`, priority: 2, status: 'next', tags: ['a', 'b'], pinned: true, workspace_id: work.id });
await call('PUT', `/api/tasks/${child.id}`, { due_at: null, parent_id: parent.id });
sameShape('task_complete', await call('PATCH', `/api/tasks/${child.id}/complete`, { completed: true }), fixtures.task_complete);
await call('PATCH', `/api/tasks/${child.id}/complete`, { completed: false });
await call('PATCH', `/api/tasks/${parent.id}/pin`, { pinned: false });
await call('PATCH', '/api/tasks/positions', { items: [{ id: parent.id, position: 0, priority: 3 }, { id: child.id, position: 1 }] });
sameShape('outstanding', await call('GET', `/api/tasks/outstanding?workspace_id=${work.id}`), fixtures.outstanding);
sameShape('calendar', await call('GET', `/api/calendar?workspace_id=${work.id}`), fixtures.calendar);
await call('GET', '/api/calendar');

// Diary + goals
const created = await call('POST', '/api/diary', { entry_date: today, workspace_id: work.id });
const entry = await call('GET', `/api/diary/${today}?workspace_id=${work.id}`);
sameShape('diary_get', entry, fixtures.diary_get);
const saved = await call('PUT', `/api/diary/${today}`, { entry_id: created.id, workspace_id: work.id, content: `${tag} journal`, expected_updated_at: entry.updated_at });
await call('PUT', `/api/diary/${today}`, { entry_id: created.id, workspace_id: work.id, content: 'stale', expected_updated_at: entry.updated_at }, { expect: [409] });
await call('PUT', `/api/diary/${today}`, { entry_id: created.id, workspace_id: null, content: 'wrong ws', expected_updated_at: saved.updated_at }, { expect: [404, 409] });
await call('PUT', `/api/diary/${today}`, { entry_id: created.id, workspace_id: work.id, content: `${tag} journal 2`, expected_updated_at: saved.updated_at });
await call('GET', `/api/diary/${plus(-3)}?workspace_id=${work.id}`, undefined, { expect: [404] });
await call('POST', '/api/diary', { entry_date: plus(1), workspace_id: work.id }); // carry-forward path
await call('GET', `/api/diary/${today}`);
await call('GET', `/api/diary?workspace_id=${work.id}`);
await call('GET', '/api/diary');
await call('GET', `/api/diary/dates?from=${plus(-7)}&to=${plus(7)}&workspace_id=${work.id}`);
await call('GET', `/api/goals/${weekStart}?workspace_id=${work.id}`);
await call('PUT', `/api/goals/${weekStart}`, { content: `${tag} goals`, workspace_id: work.id });
await call('PUT', `/api/goals/${weekStart}`, { content: `${tag} goals 2`, workspace_id: work.id });
await call('GET', `/api/goals/${weekStart}`);
const checklist = await call('POST', '/api/tasks/from-checklist', {
  items: [{ title: `${tag} from checklist`, checked: false, priority: 1, tags: ['snack'], children: [{ title: `${tag} sub`, checked: true }] }],
  source_type: 'diary', source_id: created.id, workspace_id: work.id, due_date: today,
});
await call('GET', `/api/task-links/${parent.id}`);
sameShape('completed', await call('GET', `/api/tasks/completed?from=${plus(-6)}&to=${today}&workspace_id=${work.id}`), fixtures.completed);

// Notes + links + search
const note = await call('POST', '/api/notes', { title: `${tag} note`, workspace_id: work.id, content: `hi @[${tag} parent renamed]` });
sameShape('note_create', note, fixtures.note_create);
await call('PUT', `/api/notes/${note.id}`, { title: `${tag} note 2`, content: 'body', tags: ['x'] });
await call('POST', '/api/links', { source_type: 'note', source_id: note.id, target_type: 'task', target_id: parent.id });
await call('GET', `/api/notes/${note.id}`);
await call('PATCH', `/api/notes/${note.id}/pin`, { pinned: true });
sameShape('notes_list', await call('GET', `/api/notes?workspace_id=${work.id}`), fixtures.notes_list);
await call('GET', '/api/notes?archived=true');
// Note results carry no tag fields, so compare a task result with the (task) fixture.
sameShape('search', (await call('GET', `/api/search?q=${encodeURIComponent(tag)}`)).filter(r => r.type === 'task'), fixtures.search);
await call('GET', `/api/search?q=${encodeURIComponent(tag)}&workspace_id=${work.id}`);
await call('GET', `/api/mention?q=${encodeURIComponent(tag)}`);
await call('GET', `/api/mention?q=${encodeURIComponent(tag)}&type=task`);
await call('GET', `/api/mention?q=${encodeURIComponent(tag)}&type=note`);
await call('GET', '/api/stats');
await call('GET', '/api/events?limit=5');

// Archive paths
await call('PATCH', `/api/tasks/${child.id}/archive`);
await call('PATCH', `/api/tasks/${child.id}/archive`);
await call('DELETE', `/api/tasks/${checklist[0]?.id ?? child.id}`);
await call('DELETE', `/api/notes/${note.id}`);

// Users + password
const users = await call('GET', '/api/users');
await call('POST', '/api/users', { username: `smoke${Date.now() % 100000}`, password: 'password123' });
const extra = (await call('GET', '/api/users')).find(u => u.username.startsWith('smoke'));
if (extra) await call('DELETE', `/api/users/${extra.id}`);
await call('PUT', '/api/auth/password', { current_password: 'password123', new_password: 'password123' });
await call('POST', '/api/auth/signup', { username: `signup${Date.now() % 100000}`, password: 'password123' }, { expect: [200, 403] });
await call('POST', '/api/auth/login', { username: 'master_tester', password: 'password123' });
await call('POST', '/api/auth/logout');
await call('GET', '/api/tasks', undefined, { expect: [401] });

// Timestamps keep the naive text format the clients (and the journal CAS) rely on.
const ts = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;
for (const [label, value] of [['task.created_at', parent.created_at], ['diary.updated_at', saved.updated_at], ['note.updated_at', note.updated_at]]) {
  if (!ts.test(String(value))) report(`${label} has unexpected format ${JSON.stringify(value)}`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.entry_date))) report(`diary.entry_date format ${JSON.stringify(entry.entry_date)}`);
void users; void ws;

console.log(failures ? `\n${failures} failure(s)` : '\nall API smoke checks passed');
process.exit(failures ? 1 : 0);
