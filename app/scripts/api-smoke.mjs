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
function check(label, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} check ${label}`);
  if (!ok) failures++;
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
await call('GET', '/api/setup/test', undefined, { expect: [401] });
await call('POST', '/api/auth/login', { username: 'master_tester', password: 'password123' });
await call('GET', '/api/setup/test');
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

// Templates
const tpl = await call('POST', '/api/templates', {
  id: crypto.randomUUID(), name: `${tag} template`, title: `${tag} from template`, priority: 3, tags: ['launch'],
  workspace_id: work.id, subtasks: [{ title: `${tag} step 1` }, { title: `${tag} step 2`, priority: 1, tags: ['x'] }, { title: '  ' }],
});
check('template keeps two subtasks', tpl.subtasks?.length === 2 && tpl.subtasks[1].priority === 1 && tpl.subtasks[0].priority === null);
const tplReplay = await call('POST', '/api/templates', { id: tpl.id, name: 'replayed' });
check('template create is idempotent', tplReplay.id === tpl.id && tplReplay.name === tpl.name);
await call('POST', '/api/templates', { name: '' }, { expect: [400] });
const tplEdited = await call('PUT', `/api/templates/${tpl.id}`, { name: `${tag} template 2`, subtasks: [{ title: `${tag} only step` }] });
check('template edit replaces subtasks', tplEdited.subtasks.length === 1 && tplEdited.name.endsWith('template 2'));
await call('PUT', `/api/templates/${tpl.id}`, { title: '' }, { expect: [400] });
check('template listed', (await call('GET', '/api/templates')).some(t => t.id === tpl.id));
await call('DELETE', `/api/templates/${tpl.id}`);
check('deleted template hidden', !(await call('GET', '/api/templates')).some(t => t.id === tpl.id));
await call('PUT', `/api/templates/${tpl.id}`, { name: 'gone' }, { expect: [404] });

// Bulk actions
const b1 = await call('POST', '/api/tasks', { title: `${tag} bulk 1`, workspace_id: work.id, tags: [`${tag}-Old`] });
const b2 = await call('POST', '/api/tasks', { title: `${tag} bulk 2`, workspace_id: work.id, tags: [`${tag.toLowerCase()} old`, 'keep'] });
const b2sub = await call('POST', '/api/tasks', { title: `${tag} bulk 2 sub`, parent_id: b2.id });
await call('POST', '/api/links', { source_type: 'note', source_id: note.id, target_type: 'task', target_id: b2sub.id });
let bulk = await call('POST', '/api/tasks/bulk', { ids: [b1.id, b2.id], action: 'status', value: 'done' });
check('bulk done', bulk.tasks.length === 2 && bulk.tasks.every(t => t.completed && t.status === 'done' && t.completed_at));
bulk = await call('POST', '/api/tasks/bulk', { ids: [b1.id, b2.id], action: 'status', value: 'now' });
check('bulk now', bulk.tasks.every(t => !t.completed && t.status === 'now' && !t.completed_at));
bulk = await call('POST', '/api/tasks/bulk', { ids: [b1.id, b2.id], action: 'priority', value: 1 });
check('bulk priority', bulk.tasks.every(t => t.priority === 1));
await call('POST', '/api/tasks/bulk', { ids: [b1.id], action: 'priority', value: 9 }, { expect: [400] });
await call('POST', '/api/tasks/bulk', { ids: [], action: 'archive' }, { expect: [400] });
await call('POST', '/api/tasks/bulk', { ids: [b1.id], action: 'explode' }, { expect: [400] });

// Tags (before b2 goes away): the two spellings are one custom tag
let tagList = await call('GET', '/api/tags');
const oldKey = `manual:${tag.toLowerCase().replace(/_/g, ' ')} old`;
const oldTag = tagList.find(t => t.key === oldKey);
check('custom tag counted once per spelling group', oldTag?.task_count === 2 && oldTag.variants.length === 2);
check('built-in tags listed', tagList.some(t => t.builtin && t.key === 'growth'));
await call('PUT', '/api/tags', { key: 'growth', label: 'Growth!', emoji: '🚀' });
await call('PUT', '/api/tags', { key: oldKey, archived: true, emoji: '🧪' });
tagList = await call('GET', '/api/tags');
check('tag overrides applied', tagList.find(t => t.key === 'growth')?.label === 'Growth!' && tagList.find(t => t.key === oldKey)?.archived === true);
const renamed = await call('POST', '/api/tags/rename', { key: oldKey, to: `${tag}-new` });
check('rename rewrote both tasks', renamed.tasks === 2);
const afterRename = await call('GET', `/api/tasks/batch?ids=${b1.id},${b2.id}`);
check('rename replaced every spelling, kept order + other tags',
  afterRename.find(t => t.id === b1.id)?.tags.join() === `${tag}-new` && afterRename.find(t => t.id === b2.id)?.tags.join() === `${tag}-new,keep`);
tagList = await call('GET', '/api/tags');
check('tag settings moved with the rename', tagList.find(t => t.key === renamed.key)?.archived === true && !tagList.some(t => t.key === oldKey));
await call('POST', '/api/tags/rename', { key: 'growth', to: 'x' }, { expect: [400] });
await call('POST', '/api/tags/rename', { key: 'manual:does not exist', to: 'x' }, { expect: [404] });
await call('PUT', '/api/tags', { key: 'growth', label: '', emoji: null });
await call('PUT', '/api/tags', { key: renamed.key, archived: false, emoji: null });

bulk = await call('POST', '/api/tasks/bulk', { ids: [b1.id], action: 'archive' });
check('bulk archive', bulk.tasks[0]?.archived === true);
check('archived task left the list', !(await call('GET', `/api/tasks?workspace_id=${work.id}`)).some(t => t.id === b1.id));
bulk = await call('POST', '/api/tasks/bulk', { ids: [b1.id], action: 'unarchive' });
check('bulk unarchive', bulk.tasks[0]?.archived === false);
bulk = await call('POST', '/api/tasks/bulk', { ids: [b1.id, b2.id], action: 'delete' });
check('bulk delete takes subtasks', bulk.ids.length === 3 && bulk.ids.includes(b2sub.id));
await call('GET', `/api/tasks/${b2sub.id}`, undefined, { expect: [404] });
const pulled = await call('GET', '/api/sync/pull?since=0&limit=5000');
check('delete leaves tombstones for the app', [b1.id, b2.id, b2sub.id].every(id => pulled.tombstones.some(t => t.table_name === 'tasks' && t.row_id === id)));
check('tombstones stay small (no row data in pull)', pulled.tombstones.every(t => !('row_data' in t)));

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

// Isolation: a second user sees none of master_tester's data and cannot touch it by id.
const secret = await call('POST', '/api/tasks', { title: `${tag} private`, workspace_id: work.id });
const secretNote = await call('POST', '/api/notes', { title: `${tag} private note`, content: 'x' });
const privateDiary = await call('POST', '/api/diary', { entry_date: '2035-03-04' });
const otherName = `master_tester_2_${Date.now() % 100000}`;
await call('POST', '/api/users', { username: otherName, password: 'password123' });
await call('POST', '/api/auth/logout');
await call('POST', '/api/auth/login', { username: otherName, password: 'password123' });
const theirWorkspaces = await call('GET', '/api/workspaces');
check('second user gets own default workspaces', theirWorkspaces.length === 2 && !theirWorkspaces.some(w => w.id === work.id));
const leaks = JSON.stringify([
  await call('GET', '/api/tasks'), await call('GET', '/api/tasks?archived=true'), await call('GET', '/api/notes'),
  await call('GET', '/api/calendar'), await call('GET', `/api/search?q=${encodeURIComponent(tag)}`),
  await call('GET', '/api/sync/pull?since=0'), await call('GET', '/api/tags'), await call('GET', '/api/templates'),
  await call('GET', '/api/events'), await call('GET', `/api/diary/${today}`, undefined, { expect: [200, 404] }),
]);
check('second user sees none of master_tester\'s rows', !leaks.includes(tag) && !leaks.includes(work.id) && !leaks.includes(secret.id));
await call('GET', `/api/tasks/${secret.id}`, undefined, { expect: [404] });
await call('GET', `/api/notes/${secretNote.id}`, undefined, { expect: [404] });
await call('PUT', `/api/tasks/${secret.id}`, { title: 'hijacked' }, { expect: [404] });
await call('DELETE', `/api/tasks/${secret.id}`, undefined, { expect: [404] });
await call('DELETE', `/api/notes/${secretNote.id}`, undefined, { expect: [404] });
// Foreign references must be rejected, even when creating a row owned by the caller.
await call('POST', '/api/tasks', { title: `${otherName} foreign workspace`, workspace_id: work.id }, { expect: [404] });
await call('POST', '/api/tasks', { title: `${otherName} foreign parent`, parent_id: secret.id }, { expect: [404] });
await call('POST', '/api/notes', { title: `${otherName} foreign workspace`, workspace_id: work.id }, { expect: [404] });
await call('POST', '/api/links', { source_type: 'task', source_id: secret.id, target_type: 'note', target_id: secretNote.id }, { expect: [404] });
const theirDiary = await call('POST', '/api/diary', { entry_date: '2035-03-04' });
check('default diary identities are distinct across users', theirDiary.id !== privateDiary.id && theirDiary.workspace_id !== privateDiary.workspace_id);
await call('GET', '/api/setup/test', undefined, { expect: [403] });
const mine = await call('POST', '/api/tasks', { title: `${otherName} own task` });

// Account deletion: wrong password refused, then everything of theirs is gone and login fails.
await call('DELETE', '/api/auth/account', { password: 'wrong-password' }, { expect: [401] });
const staleCookie = cookie;
await call('DELETE', '/api/auth/account', { password: 'password123' });
const clearedCookie = cookie;
cookie = staleCookie;
await call('GET', '/api/tasks', undefined, { expect: [401] });
cookie = staleCookie;
await call('POST', '/api/tasks', { title: `${otherName} stale session` }, { expect: [401] });
cookie = staleCookie;
const revoked = await call('GET', '/api/auth/check');
check('deleted account cannot renew its session on another device', revoked.user === null);
cookie = clearedCookie;
await call('GET', '/api/tasks', undefined, { expect: [401] });
await call('POST', '/api/auth/login', { username: otherName, password: 'password123' }, { expect: [401] });

await call('POST', '/api/auth/login', { username: 'master_tester', password: 'password123' });
const after = await call('GET', `/api/tasks/${secret.id}`);
check('master_tester\'s task untouched by the other user', after?.title === `${tag} private`);
await call('GET', `/api/notes/${secretNote.id}`);
await call('GET', `/api/tasks/${mine.id}`, undefined, { expect: [404] });
await call('DELETE', '/api/auth/account', { password: 'password123' }, { expect: [409] }); // only admin
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
