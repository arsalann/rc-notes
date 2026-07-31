<template>
  <div class="design-lab" :data-direction="activeDirection">
    <header class="lab-header">
      <div class="lab-eyebrow"><span class="lab-mark">rc</span><span>private design lab</span></div>
      <div class="lab-header-row">
        <div>
          <h1>Three ways to keep a day</h1>
          <p>Three small, reversible directions for a personal journal that happens to move work forward.</p>
        </div>
        <span class="lab-safety">mock data only</span>
      </div>
    </header>

    <nav class="direction-picker" aria-label="Choose a visual direction">
      <button
        v-for="direction in directions"
        :key="direction.id"
        type="button"
        class="direction-tab"
        :class="{ active: activeDirection === direction.id }"
        @click="setDirection(direction.id)">
        <span class="direction-number">{{ direction.number }}</span>
        <span class="direction-copy">
          <strong>{{ direction.name }}</strong>
          <small>{{ direction.subtitle }}</small>
        </span>
      </button>
    </nav>

    <main class="lab-main">
      <aside class="lab-brief">
        <div class="brief-card">
          <span class="brief-kicker">{{ activeMeta.number }} · {{ activeMeta.name }}</span>
          <h2>{{ activeMeta.headline }}</h2>
          <p>{{ activeMeta.description }}</p>
          <div class="brief-rule" />
          <div class="brief-row"><span>Best for</span><strong>{{ activeMeta.bestFor }}</strong></div>
          <div class="brief-row"><span>Primary gesture</span><strong>{{ activeMeta.gesture }}</strong></div>
          <div class="brief-row"><span>Information density</span><strong>{{ activeMeta.density }}</strong></div>
        </div>
        <div class="brief-note">
          <span class="brief-note-dot" />
          <p>Try the controls in the phone. They are small interaction samples, not connected to your real data.</p>
        </div>
      </aside>

      <section class="phone-stage" aria-label="Mobile mockup preview">
        <div class="phone-frame">
          <div class="phone-speaker" />

          <!-- Direction 1: paper journal -->
          <div v-if="activeDirection === 'spread'" class="mock-screen paper-screen">
            <div class="paper-status"><span>9:41</span><span>▴ ▪︎ ▪︎</span></div>
            <div class="paper-topline"><span>FIELD JOURNAL / 029</span><span>PERSONAL + WORK</span></div>
            <div class="paper-title-row">
              <div>
                <p class="paper-date">Wednesday · 29 July 2026</p>
                <h2>Today, gently.</h2>
                <p class="paper-subtitle">Make room for the one thing that matters.</p>
              </div>
              <button type="button" class="paper-round-button" aria-label="Open daily menu">☼</button>
            </div>

            <div class="paper-workspaces" role="tablist" aria-label="Workspace filter">
              <button v-for="space in workspaceOptions" :key="space" type="button" :class="{ selected: activeWorkspace === space }" @click="activeWorkspace = space">{{ space }}</button>
            </div>

            <div class="paper-days">
              <button v-for="day in days" :key="day.label" type="button" :class="{ selected: selectedDay === day.index }" @click="selectedDay = day.index">
                <span>{{ day.label }}</span><strong>{{ day.number }}</strong><i :class="{ marked: day.marked }" />
              </button>
            </div>

            <section class="paper-section paper-entry">
              <div class="paper-section-head"><span>Morning pages</span><button type="button" aria-label="Edit morning pages">✎</button></div>
              <p>I want this space to feel like opening a notebook: one honest line, then the next useful thing.</p>
              <span class="paper-line" />
              <span class="paper-line short" />
            </section>

            <section class="paper-section">
              <div class="paper-section-head"><span>Today’s list</span><em>{{ openCount }} open</em></div>
              <div class="paper-task-list">
                <div
                  v-for="task in displayedTasks"
                  :key="task.id"
                  class="paper-task"
                  :class="{ done: task.done, dragging: draggingId === task.id }"
                  draggable="true"
                  @dragstart="beginDrag(task.id)"
                  @dragover.prevent
                  @drop="dropTask(task.id)">
                  <button type="button" class="paper-check" :class="{ checked: task.done }" :aria-label="`Mark ${task.title} ${task.done ? 'open' : 'done'}`" @click="toggleTask(task.id)">{{ task.done ? '✓' : '' }}</button>
                  <div class="paper-task-copy"><strong>{{ task.title }}</strong><span>{{ task.meta }}<b v-if="task.subtasks"> · {{ task.subtasks }} subtasks</b></span></div>
                  <span class="paper-handle" aria-label="Drag to reorder">⠿</span>
                </div>
              </div>
              <form class="paper-capture" @submit.prevent="addTask">
                <span>＋</span><input v-model="newTask" aria-label="Add a task" placeholder="Write the next thing…" /><button type="submit">add</button>
              </form>
            </section>

            <div class="paper-footnote"><span>linked notes stay in the margins</span><span>↗ {{ linkedCount }} links</span></div>
            <nav class="mock-nav paper-nav" aria-label="Paper journal navigation">
              <button v-for="item in navItems" :key="item.label" type="button" :class="{ active: activeTab === item.id }" @click="activeTab = item.id"><span>{{ item.icon }}</span>{{ item.label }}</button>
            </nav>
          </div>

          <!-- Direction 2: quiet ledger -->
          <div v-else-if="activeDirection === 'ledger'" class="mock-screen ledger-screen">
            <div class="ledger-topbar"><div class="ledger-brand"><span>rc/</span><strong>ledger</strong></div><div class="ledger-top-actions"><button type="button" aria-label="Search">⌕</button><button type="button" aria-label="Profile">◎</button></div></div>
            <div class="ledger-date-row"><div><span class="ledger-overline">WEDNESDAY, JUL 29</span><h2>Daily ledger</h2></div><button type="button" class="ledger-menu" aria-label="Open day menu">•••</button></div>
            <div class="ledger-summary"><div class="ledger-summary-copy"><span>Momentum</span><strong>{{ completedCount }} of {{ tasks.length }} closed</strong></div><div class="ledger-progress"><span :style="{ width: `${progress}%` }" /></div><span class="ledger-percent">{{ progress }}%</span></div>

            <div class="ledger-switcher"><button v-for="space in workspaceOptions" :key="space" type="button" :class="{ selected: activeWorkspace === space }" @click="activeWorkspace = space">{{ space }}<span v-if="space !== 'All'">{{ workspaceCount(space) }}</span></button></div>
            <div class="ledger-date-strip"><button v-for="day in days" :key="day.label" type="button" :class="{ selected: selectedDay === day.index }" @click="selectedDay = day.index"><span>{{ day.label }}</span><strong>{{ day.number }}</strong><i :class="{ marked: day.marked }" /></button></div>

            <section class="ledger-section"><div class="ledger-section-title"><span>OPEN LOOP</span><button type="button" aria-label="Sort tasks">↕</button></div>
              <div class="ledger-task-list">
                <div v-for="task in displayedTasks" :key="task.id" class="ledger-task" :class="[{ done: task.done }, `priority-${task.priority}`, { dragging: draggingId === task.id }]" draggable="true" @dragstart="beginDrag(task.id)" @dragover.prevent @drop="dropTask(task.id)">
                  <span class="ledger-task-rail" /><button type="button" class="ledger-check" :class="{ checked: task.done }" @click="toggleTask(task.id)" :aria-label="`Toggle ${task.title}`">{{ task.done ? '✓' : '' }}</button><div class="ledger-task-copy"><strong>{{ task.title }}</strong><span><b>{{ task.tag }}</b> · {{ task.meta }}</span></div><span class="ledger-grip">⋮⋮</span>
                </div>
              </div>
              <form class="ledger-capture" @submit.prevent="addTask"><span class="ledger-plus">+</span><input v-model="newTask" aria-label="Capture a task" placeholder="Capture a task or thought" /><button type="submit">Capture</button></form>
            </section>

            <section class="ledger-note-card"><div class="ledger-note-head"><span>NOTEBOOK / TODAY</span><button type="button" aria-label="Open notebook">↗</button></div><p>“The system should disappear behind the day.”</p><div class="ledger-note-meta"><span>2 linked tasks</span><span>edited 08:42</span></div></section>
            <nav class="mock-nav ledger-nav" aria-label="Ledger navigation"><button v-for="item in navItems" :key="item.label" type="button" :class="{ active: activeTab === item.id }" @click="activeTab = item.id"><span>{{ item.icon }}</span><b>{{ item.label }}</b></button></nav>
          </div>

          <!-- Direction 3: signal board -->
          <div v-else class="mock-screen signal-screen">
            <div class="signal-orbit orbit-one" /><div class="signal-orbit orbit-two" />
            <div class="signal-topbar"><div class="signal-logo"><span>✳</span><strong>rc notes</strong></div><button type="button" class="signal-avatar" aria-label="Open profile">A</button></div>
            <div class="signal-greeting"><span class="signal-overline">WED · 29 JUL</span><h2>Good morning, Arsalan.</h2><p>One clear move is enough to start.</p></div>
            <div class="signal-focus"><div class="signal-focus-label"><span>FOCUS NOW</span><i>↗</i></div><h3>{{ focusTask?.title || 'Choose your next move' }}</h3><p>{{ focusTask?.meta || 'Nothing is asking for your attention yet.' }}</p><button type="button" @click="focusTask && toggleTask(focusTask.id)">{{ focusTask?.done ? 'Re-open focus' : 'Mark focus done' }} <span>→</span></button></div>

            <div class="signal-board-head"><span>Flow board</span><div><button v-for="space in workspaceOptions" :key="space" type="button" :class="{ selected: activeWorkspace === space }" @click="activeWorkspace = space">{{ space }}</button></div></div>
            <div class="signal-lanes">
              <section class="signal-lane" @dragover.prevent @drop="dropToLane('now')"><div class="signal-lane-title"><span class="lane-dot now" />Now <em>{{ laneTasks('now').length }}</em></div><div v-for="task in laneTasks('now')" :key="task.id" class="signal-card" :class="{ dragging: draggingId === task.id }" draggable="true" @dragstart="beginDrag(task.id)" @dragover.prevent @drop.stop="dropTask(task.id)"><button type="button" class="signal-card-check" @click="toggleTask(task.id)" aria-label="Complete task">○</button><div><strong>{{ task.title }}</strong><span>{{ task.tag }} · {{ task.meta }}</span></div><b>⠿</b></div></section>
              <section class="signal-lane" @dragover.prevent @drop="dropToLane('next')"><div class="signal-lane-title"><span class="lane-dot next" />Next <em>{{ laneTasks('next').length }}</em></div><div v-for="task in laneTasks('next')" :key="task.id" class="signal-card" :class="{ dragging: draggingId === task.id }" draggable="true" @dragstart="beginDrag(task.id)" @dragover.prevent @drop.stop="dropTask(task.id)"><button type="button" class="signal-card-check" @click="toggleTask(task.id)" aria-label="Complete task">○</button><div><strong>{{ task.title }}</strong><span>{{ task.tag }} · {{ task.meta }}</span></div><b>⠿</b></div></section>
            </div>
            <form class="signal-capture" @submit.prevent="addTask"><input v-model="newTask" aria-label="Add a move" placeholder="Add a move…" /><button type="submit">+</button></form>
            <div class="signal-footer-row"><button type="button" @click="activeTab = 'Notes'"><span>↗</span><strong>Open notebook</strong><small>2 recent pages</small></button><button type="button" @click="activeTab = 'Calendar'"><span>◷</span><strong>See the week</strong><small>3 upcoming tasks</small></button></div>
            <nav class="mock-nav signal-nav" aria-label="Signal navigation"><button v-for="item in navItems" :key="item.label" type="button" :class="{ active: activeTab === item.id }" @click="activeTab = item.id"><span>{{ item.icon }}</span>{{ item.label }}</button></nav>
          </div>

          <div class="phone-home-indicator" />
        </div>
      </section>
    </main>

    <footer class="lab-footer">
      <span>Review the feeling of the day first.</span>
      <span>We’ll only refactor after you choose a direction.</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: () => navigateTo('/daily-spread', { replace: true }),
});

const directions = [
  { id: 'spread', number: '01', name: 'Daily spread', subtitle: 'paper journal', headline: 'A page you want to return to.', description: 'Warm paper, handwriting-like hierarchy, and gentle section breaks. The diary remains the emotional center; tasks live naturally inside the page.', bestFor: 'reflection + steady planning', gesture: 'tap a row, then drag the grip', density: 'low / spacious' },
  { id: 'ledger', number: '02', name: 'Quiet ledger', subtitle: 'calm command center', headline: 'A quiet system for a noisy day.', description: 'A compact personal dashboard with clear progress, quick capture, and strong visual grouping. More information is visible without feeling like a spreadsheet.', bestFor: 'daily execution', gesture: 'drag a row to reorder', density: 'medium / balanced' },
  { id: 'signal', number: '03', name: 'Signal board', subtitle: 'fluid focus mode', headline: 'See the next move immediately.', description: 'A more dynamic direction: one focus task, two lightweight lanes, and deliberate transitions between today, notes, and the week.', bestFor: 'momentum + triage', gesture: 'move cards between lanes', density: 'high / energetic' },
];

const activeDirection = ref('spread');
const activeWorkspace = ref('All');
const activeTab = ref('Today');
const selectedDay = ref(3);
const newTask = ref('');
const draggingId = ref(null);

const workspaceOptions = ['All', 'Work', 'Personal'];
const days = [
  { index: 0, label: 'M', number: '27', marked: false },
  { index: 1, label: 'T', number: '28', marked: true },
  { index: 2, label: 'W', number: '29', marked: true },
  { index: 3, label: 'T', number: '30', marked: false },
  { index: 4, label: 'F', number: '31', marked: true },
  { index: 5, label: 'S', number: '01', marked: false },
  { index: 6, label: 'S', number: '02', marked: false },
];
const navItems = [
  { id: 'Today', label: 'Today', icon: '⌂' },
  { id: 'Tasks', label: 'Tasks', icon: '✓' },
  { id: 'Notes', label: 'Notes', icon: '▤' },
  { id: 'Calendar', label: 'Week', icon: '▦' },
];

const tasks = ref([
  { id: 'brief', title: 'Close the product brief', meta: 'due today · 2/3', tag: 'FOCUS', workspace: 'Work', priority: 'focus', lane: 'now', done: false, subtasks: 3 },
  { id: 'groceries', title: 'Pick up groceries', meta: 'before 18:00', tag: 'LIFE', workspace: 'Personal', priority: 'light', lane: 'next', done: false },
  { id: 'reply', title: 'Reply to design review', meta: '10 min', tag: 'WORK', workspace: 'Work', priority: 'steady', lane: 'now', done: true },
  { id: 'walk', title: 'Walk without the phone', meta: 'evening ritual', tag: 'RESET', workspace: 'Personal', priority: 'light', lane: 'next', done: false },
]);

const activeMeta = computed(() => directions.find(direction => direction.id === activeDirection.value));
const displayedTasks = computed(() => activeWorkspace.value === 'All' ? tasks.value : tasks.value.filter(task => task.workspace === activeWorkspace.value));
const completedCount = computed(() => tasks.value.filter(task => task.done).length);
const openCount = computed(() => tasks.value.filter(task => !task.done).length);
const progress = computed(() => Math.round((completedCount.value / tasks.value.length) * 100));
const linkedCount = computed(() => tasks.value.filter(task => task.tag === 'FOCUS' || task.tag === 'WORK').length);
const focusTask = computed(() => tasks.value.find(task => task.priority === 'focus') || tasks.value.find(task => !task.done));

function setDirection(id) {
  activeDirection.value = id;
  draggingId.value = null;
}

function toggleTask(id) {
  const task = tasks.value.find(item => item.id === id);
  if (!task) return;
  task.done = !task.done;
  task.lane = task.done ? 'done' : task.priority === 'focus' ? 'now' : 'next';
}

function beginDrag(id) {
  draggingId.value = id;
}

function dropTask(targetId) {
  const sourceId = draggingId.value;
  draggingId.value = null;
  if (!sourceId || sourceId === targetId) return;
  const sourceIndex = tasks.value.findIndex(task => task.id === sourceId);
  const targetIndex = tasks.value.findIndex(task => task.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [moved] = tasks.value.splice(sourceIndex, 1);
  if (moved) tasks.value.splice(targetIndex, 0, moved);
}

function dropToLane(lane) {
  const sourceId = draggingId.value;
  draggingId.value = null;
  if (!sourceId) return;
  const task = tasks.value.find(item => item.id === sourceId);
  if (task) {
    task.lane = lane;
    task.done = false;
  }
}

function addTask() {
  const title = newTask.value.trim();
  if (!title) return;
  const workspace = activeWorkspace.value === 'All' ? 'Personal' : activeWorkspace.value;
  tasks.value.unshift({
    id: `new-${Date.now()}`,
    title,
    meta: 'just captured',
    tag: workspace === 'Work' ? 'WORK' : 'LIFE',
    workspace,
    priority: 'steady',
    lane: 'next',
    done: false,
  });
  newTask.value = '';
}

function workspaceCount(workspace: string) {
  return tasks.value.filter(task => workspace === 'All' || task.workspace === workspace).length;
}

function laneTasks(lane) {
  return displayedTasks.value.filter(task => task.lane === lane && !task.done);
}
</script>

<style>
:root {
  --lab-ink: #20222a;
  --lab-muted: #787a82;
  --lab-line: rgba(32, 34, 42, 0.12);
  --lab-panel: #f5f5f2;
}

.design-lab {
  min-height: 100vh;
  color: var(--lab-ink);
  background: #ecece8;
  font-family: var(--daybook-serif);
  padding: 36px clamp(16px, 4vw, 60px) 32px;
}

.lab-header,
.direction-picker,
.lab-main,
.lab-footer {
  width: min(1180px, 100%);
  margin-inline: auto;
}

.lab-eyebrow,
.lab-header-row,
.direction-tab,
.brief-row,
.paper-topline,
.paper-title-row,
.paper-section-head,
.paper-footnote,
.ledger-topbar,
.ledger-date-row,
.ledger-summary,
.ledger-section-title,
.ledger-note-head,
.signal-topbar,
.signal-focus-label,
.signal-board-head,
.signal-lane-title,
.signal-footer-row,
.lab-footer {
  display: flex;
  align-items: center;
}

.lab-eyebrow {
  gap: 8px;
  color: #777a80;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.lab-mark {
  display: inline-grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 9px;
  background: #1f222b;
  color: #f5f5f2;
  font-size: 11px;
  letter-spacing: -0.04em;
  text-transform: lowercase;
}

.lab-header-row {
  justify-content: space-between;
  gap: 24px;
  margin-top: 22px;
}

.lab-header h1 {
  max-width: 650px;
  margin: 0;
  color: #20222a;
  font-size: clamp(30px, 5vw, 56px);
  font-weight: 650;
  letter-spacing: -0.055em;
  line-height: 0.98;
}

.lab-header p {
  max-width: 570px;
  margin: 14px 0 0;
  color: #777a80;
  font-size: 15px;
  line-height: 1.55;
}

.lab-safety {
  flex: 0 0 auto;
  padding: 7px 10px;
  border: 1px solid rgba(32, 34, 42, 0.14);
  border-radius: 999px;
  color: #777a80;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.direction-picker {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 34px;
}

.direction-tab {
  min-width: 0;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(32, 34, 42, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.35);
  color: #777a80;
  text-align: left;
  transition: 180ms ease;
}

.direction-tab:hover,
.direction-tab.active {
  border-color: #20222a;
  background: #f7f7f4;
  color: #20222a;
  transform: translateY(-2px);
}

.direction-number {
  color: #a0a2a5;
  font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
}

.direction-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.direction-copy strong {
  overflow: hidden;
  color: inherit;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direction-copy small {
  overflow: hidden;
  color: #999ba0;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lab-main {
  display: grid;
  grid-template-columns: minmax(230px, 0.75fr) minmax(360px, 1fr);
  align-items: start;
  gap: clamp(30px, 8vw, 120px);
  margin-top: 44px;
}

.lab-brief {
  position: sticky;
  top: 28px;
}

.brief-card {
  padding: 24px;
  border: 1px solid rgba(32, 34, 42, 0.12);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.42);
}

.brief-kicker {
  color: #777a80;
  font: 700 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.brief-card h2 {
  margin: 18px 0 10px;
  color: #20222a;
  font-size: 25px;
  font-weight: 650;
  letter-spacing: -0.04em;
  line-height: 1.05;
}

.brief-card p,
.brief-note p {
  margin: 0;
  color: #777a80;
  font-size: 13px;
  line-height: 1.55;
}

.brief-rule {
  height: 1px;
  margin: 22px 0 5px;
  background: rgba(32, 34, 42, 0.12);
}

.brief-row {
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(32, 34, 42, 0.08);
  color: #999ba0;
  font-size: 11px;
}

.brief-row:last-child { border-bottom: 0; }
.brief-row strong { color: #20222a; font-size: 11px; font-weight: 700; text-align: right; }

.brief-note {
  display: flex;
  gap: 10px;
  margin: 18px 6px;
}

.brief-note-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-top: 6px;
  border-radius: 50%;
  background: #e27756;
}

.phone-stage {
  display: grid;
  place-items: start center;
}

.phone-frame {
  position: relative;
  width: min(390px, 100%);
  padding: 10px;
  border-radius: 44px;
  background: #20222a;
  box-shadow: 0 26px 80px rgba(35, 37, 43, 0.26), 0 3px 0 rgba(255, 255, 255, 0.8) inset;
}

.phone-speaker {
  position: absolute;
  z-index: 3;
  top: 18px;
  left: 50%;
  width: 74px;
  height: 22px;
  border-radius: 999px;
  background: #20222a;
  transform: translateX(-50%);
}

.phone-home-indicator {
  position: absolute;
  z-index: 3;
  bottom: 18px;
  left: 50%;
  width: 108px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  transform: translateX(-50%);
}

.mock-screen {
  min-height: 790px;
  overflow: hidden;
  border-radius: 35px;
  position: relative;
}

.mock-screen button,
.mock-screen input { font: inherit; }
.mock-screen button { cursor: pointer; }
.mock-screen input::placeholder { opacity: 0.55; }
.mock-screen button:focus-visible,
.mock-screen input:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }

.mock-nav {
  position: absolute;
  right: 18px;
  bottom: 18px;
  left: 18px;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: center;
  min-height: 58px;
}

.mock-nav button {
  display: grid;
  justify-items: center;
  gap: 3px;
  border: 0;
  background: transparent;
  font-size: 9px;
  letter-spacing: 0.01em;
}

.mock-nav button span { font-size: 17px; line-height: 1; }
.mock-nav button.active { font-weight: 750; }

/* Paper direction */
.paper-screen {
  padding: 26px 20px 96px;
  color: #332e29;
  background: #f4ecd9;
  background-image: linear-gradient(rgba(190, 166, 127, 0.09) 1px, transparent 1px), radial-gradient(rgba(104, 80, 45, 0.035) 0.7px, transparent 0.7px);
  background-position: 0 28px, 0 0;
  background-size: 100% 29px, 5px 5px;
  font-family: var(--daybook-serif);
}

.paper-screen::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 39px;
  width: 1px;
  background: rgba(205, 106, 89, 0.23);
  content: "";
}

.paper-status,
.paper-topline,
.paper-date,
.paper-workspaces,
.paper-days,
.paper-section,
.paper-footnote,
.paper-nav { position: relative; z-index: 1; }
.paper-status { display: flex; justify-content: space-between; padding: 2px 4px 17px 13px; color: rgba(51, 46, 41, 0.5); font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.paper-topline { justify-content: space-between; margin: 10px 0 19px 13px; color: rgba(51, 46, 41, 0.5); font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.09em; }
.paper-title-row { align-items: flex-start; justify-content: space-between; margin-left: 13px; }
.paper-date { margin: 0 0 8px; color: #b26657; font-size: 12px; font-style: italic; }
.paper-title-row h2 { margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.05em; line-height: 0.95; }
.paper-subtitle { max-width: 230px; margin: 10px 0 0; color: rgba(51, 46, 41, 0.65); font-size: 12px; line-height: 1.45; }
.paper-round-button { display: grid; width: 39px; height: 39px; place-items: center; border: 1px solid rgba(51, 46, 41, 0.2); border-radius: 50%; background: rgba(255, 250, 232, 0.38); color: #b26657; font-size: 20px; }
.paper-workspaces { display: flex; gap: 6px; margin: 24px 0 14px 13px; overflow-x: auto; scrollbar-width: none; }
.paper-workspaces::-webkit-scrollbar { display: none; }
.paper-workspaces button { padding: 6px 10px; border: 1px solid rgba(51, 46, 41, 0.17); border-radius: 999px; background: transparent; color: rgba(51, 46, 41, 0.6); font-size: 10px; }
.paper-workspaces button.selected { border-color: #332e29; background: #332e29; color: #f4ecd9; }
.paper-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin: 0 0 17px 13px; padding: 9px 0 12px; border-top: 1px solid rgba(51, 46, 41, 0.13); border-bottom: 1px solid rgba(51, 46, 41, 0.13); }
.paper-days button { display: grid; justify-items: center; gap: 4px; padding: 4px 0; border: 0; background: transparent; color: rgba(51, 46, 41, 0.52); }
.paper-days button span { font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.paper-days button strong { font-size: 15px; font-weight: 700; }
.paper-days button i { width: 4px; height: 4px; border-radius: 50%; background: transparent; }
.paper-days button i.marked { background: #b26657; }
.paper-days button.selected { color: #b26657; }
.paper-days button.selected strong { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.paper-section { margin-left: 13px; }
.paper-section + .paper-section { margin-top: 24px; }
.paper-section-head { justify-content: space-between; margin-bottom: 8px; color: #b26657; font-size: 12px; font-weight: 700; }
.paper-section-head em { color: rgba(51, 46, 41, 0.48); font-size: 10px; font-style: normal; font-weight: 400; }
.paper-section-head button { border: 0; background: transparent; color: #b26657; font-size: 17px; }
.paper-entry { padding: 3px 0 2px; }
.paper-entry p { max-width: 290px; margin: 0; color: rgba(51, 46, 41, 0.78); font-size: 13px; line-height: 1.7; }
.paper-line { display: block; width: 82%; height: 1px; margin-top: 9px; background: rgba(51, 46, 41, 0.13); }
.paper-line.short { width: 55%; }
.paper-task-list { display: grid; gap: 2px; }
.paper-task { display: flex; align-items: flex-start; gap: 9px; min-height: 42px; padding: 8px 5px 8px 1px; border-bottom: 1px dashed rgba(51, 46, 41, 0.18); transition: 150ms ease; }
.paper-task.dragging { opacity: 0.45; background: rgba(178, 102, 87, 0.1); }
.paper-check { flex: 0 0 auto; width: 18px; height: 18px; margin-top: 1px; border: 1px solid #6e665f; border-radius: 50%; background: transparent; color: #b26657; font-size: 13px; line-height: 1; }
.paper-check.checked { border-color: #b26657; background: #b26657; color: #f4ecd9; }
.paper-task-copy { display: grid; flex: 1; min-width: 0; gap: 2px; }
.paper-task-copy strong { overflow: hidden; font-size: 13px; font-weight: 600; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.paper-task-copy span { color: rgba(51, 46, 41, 0.52); font: 10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
.paper-task-copy b { color: #b26657; font-weight: 700; }
.paper-task.done .paper-task-copy strong { color: rgba(51, 46, 41, 0.45); text-decoration: line-through; }
.paper-handle { padding-top: 1px; color: rgba(51, 46, 41, 0.35); font-size: 18px; letter-spacing: -5px; }
.paper-capture { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 6px; border-bottom: 1px solid rgba(178, 102, 87, 0.42); color: #b26657; }
.paper-capture input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #332e29; font-size: 12px; }
.paper-capture button { border: 0; background: transparent; color: #b26657; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.paper-footnote { justify-content: space-between; margin: 23px 0 0 13px; color: rgba(51, 46, 41, 0.42); font-size: 10px; font-style: italic; }
.paper-nav { border-top: 1px solid rgba(51, 46, 41, 0.18); background: linear-gradient(to top, rgba(244, 236, 217, 0.98), rgba(244, 236, 217, 0.75)); color: rgba(51, 46, 41, 0.5); }
.paper-nav button.active { color: #b26657; }

/* Ledger direction */
.ledger-screen { padding: 43px 19px 98px; color: #f0f2f0; background: #1b2428; font-family: var(--daybook-serif); }
.ledger-screen::before { position: absolute; inset: 0; background: radial-gradient(circle at 100% 0%, rgba(110, 182, 157, 0.12), transparent 36%), linear-gradient(145deg, rgba(255, 255, 255, 0.025), transparent 50%); content: ""; pointer-events: none; }
.ledger-screen > * { position: relative; z-index: 1; }
.ledger-topbar { justify-content: space-between; }
.ledger-brand { display: flex; align-items: baseline; gap: 4px; font-size: 16px; letter-spacing: -0.05em; }
.ledger-brand span { color: #82c8b1; font-weight: 800; }
.ledger-brand strong { color: #eef3ef; font-weight: 650; }
.ledger-top-actions { display: flex; gap: 4px; }
.ledger-top-actions button, .ledger-menu, .ledger-note-head button { width: 30px; height: 30px; border: 1px solid rgba(238, 243, 239, 0.12); border-radius: 10px; background: rgba(255, 255, 255, 0.04); color: rgba(238, 243, 239, 0.65); }
.ledger-date-row { justify-content: space-between; align-items: flex-end; margin: 35px 0 20px; }
.ledger-overline, .ledger-section-title span, .ledger-note-head span { color: rgba(238, 243, 239, 0.45); font: 700 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.13em; }
.ledger-date-row h2 { margin: 7px 0 0; color: #eef3ef; font-size: 29px; font-weight: 650; letter-spacing: -0.06em; line-height: 1; }
.ledger-summary { gap: 13px; padding: 14px; border: 1px solid rgba(130, 200, 177, 0.18); border-radius: 15px; background: rgba(130, 200, 177, 0.08); }
.ledger-summary-copy { display: grid; flex: 0 0 auto; gap: 4px; }
.ledger-summary-copy span { color: #82c8b1; font-size: 10px; font-weight: 750; text-transform: uppercase; }
.ledger-summary-copy strong { color: #d9e6df; font-size: 11px; font-weight: 500; }
.ledger-progress { flex: 1; height: 5px; overflow: hidden; border-radius: 99px; background: rgba(238, 243, 239, 0.12); }
.ledger-progress span { display: block; height: 100%; border-radius: inherit; background: #82c8b1; transition: width 200ms ease; }
.ledger-percent { color: #82c8b1; font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.ledger-switcher { display: flex; gap: 6px; margin-top: 24px; overflow: auto; scrollbar-width: none; }
.ledger-switcher::-webkit-scrollbar { display: none; }
.ledger-switcher button { padding: 7px 10px; border: 1px solid rgba(238, 243, 239, 0.12); border-radius: 9px; background: transparent; color: rgba(238, 243, 239, 0.5); font-size: 10px; }
.ledger-switcher button span { margin-left: 5px; color: rgba(238, 243, 239, 0.35); }
.ledger-switcher button.selected { border-color: #82c8b1; background: #82c8b1; color: #1b2428; font-weight: 750; }
.ledger-switcher button.selected span { color: rgba(27, 36, 40, 0.62); }
.ledger-date-strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin: 14px 0 25px; padding: 3px 0 12px; border-bottom: 1px solid rgba(238, 243, 239, 0.11); }
.ledger-date-strip button { display: grid; justify-items: center; gap: 5px; padding: 5px 0; border: 0; border-radius: 9px; background: transparent; color: rgba(238, 243, 239, 0.44); }
.ledger-date-strip button span { font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.ledger-date-strip button strong { font-size: 13px; font-weight: 650; }
.ledger-date-strip button i { width: 4px; height: 4px; border-radius: 50%; background: transparent; }
.ledger-date-strip button i.marked { background: #eaa575; }
.ledger-date-strip button.selected { background: rgba(130, 200, 177, 0.12); color: #eef3ef; }
.ledger-date-strip button.selected i { background: #82c8b1; }
.ledger-section-title { justify-content: space-between; margin-bottom: 9px; }
.ledger-section-title button { border: 0; background: transparent; color: rgba(238, 243, 239, 0.45); font-size: 17px; }
.ledger-task-list { display: grid; gap: 7px; }
.ledger-task { position: relative; display: flex; align-items: center; gap: 10px; min-height: 58px; padding: 9px 9px 9px 12px; overflow: hidden; border: 1px solid rgba(238, 243, 239, 0.1); border-radius: 13px; background: rgba(255, 255, 255, 0.045); transition: 150ms ease; }
.ledger-task.dragging { opacity: 0.45; transform: scale(0.98); }
.ledger-task-rail { align-self: stretch; width: 3px; border-radius: 99px; background: #82c8b1; }
.priority-light .ledger-task-rail { background: #eaa575; }
.priority-steady .ledger-task-rail { background: #96a9c7; }
.ledger-check { display: grid; flex: 0 0 auto; width: 21px; height: 21px; place-items: center; border: 1px solid rgba(238, 243, 239, 0.34); border-radius: 50%; background: transparent; color: #1b2428; font-size: 13px; }
.ledger-check.checked { border-color: #82c8b1; background: #82c8b1; }
.ledger-task-copy { display: grid; flex: 1; min-width: 0; gap: 4px; }
.ledger-task-copy strong { overflow: hidden; color: #e8eeeb; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.ledger-task-copy span { overflow: hidden; color: rgba(238, 243, 239, 0.43); font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.ledger-task-copy b { color: #eaa575; font-weight: 700; }
.ledger-task.done { opacity: 0.52; }
.ledger-task.done .ledger-task-copy strong { text-decoration: line-through; }
.ledger-grip { color: rgba(238, 243, 239, 0.3); font-size: 16px; letter-spacing: -4px; }
.ledger-capture { display: flex; align-items: center; gap: 9px; margin-top: 10px; padding: 12px 11px; border: 1px dashed rgba(130, 200, 177, 0.38); border-radius: 12px; background: rgba(130, 200, 177, 0.06); }
.ledger-plus { color: #82c8b1; font-size: 20px; font-weight: 300; line-height: 1; }
.ledger-capture input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #eef3ef; font-size: 11px; }
.ledger-capture button { padding: 6px 8px; border: 0; border-radius: 7px; background: #82c8b1; color: #1b2428; font-size: 9px; font-weight: 800; text-transform: uppercase; }
.ledger-note-card { margin-top: 23px; padding: 13px; border: 1px solid rgba(238, 243, 239, 0.1); border-radius: 13px; background: rgba(255, 255, 255, 0.035); }
.ledger-note-head { justify-content: space-between; }
.ledger-note-card p { margin: 12px 0 14px; color: #d8e2dd; font-family: var(--daybook-serif); font-size: 15px; font-style: italic; line-height: 1.35; }
.ledger-note-meta { display: flex; justify-content: space-between; color: rgba(238, 243, 239, 0.37); font: 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.ledger-nav { border: 1px solid rgba(238, 243, 239, 0.11); border-radius: 17px; background: rgba(23, 31, 34, 0.94); color: rgba(238, 243, 239, 0.42); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); }
.ledger-nav button { font-size: 8px; }
.ledger-nav button span { font-size: 16px; }
.ledger-nav button.active { color: #82c8b1; }

/* Signal direction */
.signal-screen { padding: 43px 18px 98px; color: #f2f3f7; background: #171927; font-family: var(--daybook-serif); }
.signal-screen::before { position: absolute; inset: 0; background: radial-gradient(circle at 10% 10%, rgba(133, 125, 255, 0.22), transparent 34%), radial-gradient(circle at 90% 43%, rgba(236, 119, 91, 0.12), transparent 33%); content: ""; pointer-events: none; }
.signal-screen > *:not(.signal-orbit) { position: relative; z-index: 1; }
.signal-orbit { position: absolute; border: 1px solid rgba(133, 125, 255, 0.15); border-radius: 50%; pointer-events: none; }
.orbit-one { top: -160px; right: -145px; width: 330px; height: 330px; }
.orbit-two { top: -113px; right: -98px; width: 236px; height: 236px; border-color: rgba(240, 143, 111, 0.12); }
.signal-topbar { justify-content: space-between; }
.signal-logo { display: flex; align-items: center; gap: 7px; color: #f2f3f7; font-size: 13px; letter-spacing: -0.03em; }
.signal-logo span { display: grid; width: 23px; height: 23px; place-items: center; border-radius: 8px; background: #867eff; color: #171927; font-size: 13px; }
.signal-avatar { display: grid; width: 27px; height: 27px; place-items: center; border: 1px solid rgba(242, 243, 247, 0.2); border-radius: 50%; background: transparent; color: #d9d7ff; font-size: 11px; }
.signal-greeting { margin-top: 38px; }
.signal-overline { color: #9d9bad; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.16em; }
.signal-greeting h2 { max-width: 270px; margin: 11px 0 7px; color: #f2f3f7; font-size: 25px; font-weight: 650; letter-spacing: -0.055em; line-height: 1.02; }
.signal-greeting p { margin: 0; color: #9d9bad; font-size: 11px; }
.signal-focus { margin-top: 25px; padding: 16px; border: 1px solid rgba(134, 126, 255, 0.5); border-radius: 17px; background: linear-gradient(140deg, rgba(134, 126, 255, 0.27), rgba(134, 126, 255, 0.08)); box-shadow: 0 14px 28px rgba(7, 8, 17, 0.18); }
.signal-focus-label { justify-content: space-between; color: #c3bfff; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.15em; }
.signal-focus-label i { color: #f09a75; font-size: 17px; font-style: normal; }
.signal-focus h3 { margin: 14px 0 6px; color: #fff; font-size: 16px; font-weight: 650; letter-spacing: -0.03em; }
.signal-focus p { margin: 0; color: #bebcce; font-size: 11px; }
.signal-focus button { display: flex; justify-content: space-between; width: 100%; margin-top: 15px; padding: 9px 10px; border: 1px solid rgba(242, 243, 247, 0.18); border-radius: 9px; background: rgba(23, 25, 39, 0.3); color: #f2f3f7; font-size: 10px; font-weight: 700; }
.signal-focus button span { color: #f09a75; font-size: 15px; line-height: 0.7; }
.signal-board-head { justify-content: space-between; gap: 8px; margin: 25px 0 10px; }
.signal-board-head > span { color: #f2f3f7; font-size: 12px; font-weight: 700; }
.signal-board-head > div { display: flex; gap: 3px; }
.signal-board-head button { padding: 5px 7px; border: 0; border-radius: 6px; background: transparent; color: #79788b; font-size: 9px; }
.signal-board-head button.selected { background: rgba(134, 126, 255, 0.16); color: #bebaff; }
.signal-lanes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.signal-lane { min-width: 0; padding: 9px; border: 1px solid rgba(242, 243, 247, 0.09); border-radius: 13px; background: rgba(255, 255, 255, 0.035); }
.signal-lane-title { gap: 6px; margin-bottom: 9px; color: #c4c2cf; font-size: 10px; font-weight: 700; }
.signal-lane-title em { margin-left: auto; color: #77778b; font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; font-style: normal; }
.lane-dot { width: 6px; height: 6px; border-radius: 50%; }
.lane-dot.now { background: #f09a75; box-shadow: 0 0 0 3px rgba(240, 154, 117, 0.12); }
.lane-dot.next { background: #867eff; box-shadow: 0 0 0 3px rgba(134, 126, 255, 0.12); }
.signal-card { display: flex; align-items: flex-start; gap: 6px; min-height: 69px; padding: 9px 7px; border: 1px solid rgba(242, 243, 247, 0.09); border-radius: 9px; background: rgba(23, 25, 39, 0.45); transition: 150ms ease; }
.signal-card + .signal-card { margin-top: 6px; }
.signal-card.dragging { opacity: 0.45; transform: translateY(2px) rotate(1deg); }
.signal-card-check { flex: 0 0 auto; padding: 0; border: 0; background: transparent; color: #858398; font-size: 18px; line-height: 1; }
.signal-card > div { display: grid; flex: 1; min-width: 0; gap: 5px; }
.signal-card strong { overflow: hidden; color: #e9e9f2; font-size: 10px; font-weight: 600; line-height: 1.2; text-overflow: ellipsis; }
.signal-card span { overflow: hidden; color: #7e7d91; font: 8px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.signal-card > b { color: #5e5d73; font-size: 13px; letter-spacing: -4px; }
.signal-capture { display: flex; gap: 7px; margin-top: 12px; padding: 9px 10px; border: 1px solid rgba(242, 243, 247, 0.12); border-radius: 10px; background: rgba(255, 255, 255, 0.04); }
.signal-capture input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #f2f3f7; font-size: 10px; }
.signal-capture button { display: grid; width: 23px; height: 23px; place-items: center; border: 0; border-radius: 7px; background: #f09a75; color: #171927; font-size: 17px; line-height: 1; }
.signal-footer-row { gap: 8px; margin-top: 16px; }
.signal-footer-row button { display: grid; flex: 1; grid-template-columns: 22px 1fr; grid-template-rows: auto auto; column-gap: 6px; padding: 10px; border: 1px solid rgba(242, 243, 247, 0.1); border-radius: 11px; background: rgba(255, 255, 255, 0.035); color: #c9c8d5; text-align: left; }
.signal-footer-row button span { grid-row: 1 / span 2; color: #f09a75; font-size: 16px; }
.signal-footer-row strong { font-size: 9px; font-weight: 700; }
.signal-footer-row small { margin-top: 3px; color: #77768a; font-size: 8px; }
.signal-nav { border: 1px solid rgba(242, 243, 247, 0.12); border-radius: 17px; background: rgba(16, 17, 29, 0.9); color: #77768a; }
.signal-nav button { font-size: 8px; }
.signal-nav button span { font-size: 16px; }
.signal-nav button.active { color: #f09a75; }

.lab-footer {
  justify-content: space-between;
  gap: 20px;
  margin-top: 40px;
  padding-top: 19px;
  border-top: 1px solid rgba(32, 34, 42, 0.12);
  color: #898b91;
  font-size: 11px;
}

@media (max-width: 780px) {
  .design-lab { padding: 22px 14px 24px; }
  .lab-header-row { align-items: flex-start; flex-direction: column; gap: 14px; }
  .lab-header p { font-size: 13px; }
  .lab-safety { align-self: flex-start; }
  .direction-picker { margin-top: 24px; }
  .direction-tab { padding: 11px 9px; gap: 8px; }
  .direction-copy strong { font-size: 11px; }
  .direction-copy small { font-size: 9px; }
  .lab-main { display: flex; flex-direction: column; gap: 22px; margin-top: 26px; }
  .lab-brief { position: static; order: 2; }
  .phone-stage { order: 1; width: 100%; }
  .brief-card { padding: 18px; }
  .brief-card h2 { font-size: 22px; }
  .lab-footer { align-items: flex-start; flex-direction: column; gap: 5px; margin-top: 28px; }
}

@media (max-width: 430px) {
  .direction-picker { grid-template-columns: 1fr; }
  .direction-tab { min-height: 54px; }
  .direction-copy strong { font-size: 12px; }
  .direction-copy small { font-size: 10px; }
  .phone-frame { border-radius: 35px; padding: 7px; }
  .mock-screen { min-height: 760px; border-radius: 29px; }
  .paper-screen, .ledger-screen, .signal-screen { padding-top: 36px; }
}

@media (prefers-reduced-motion: reduce) {
  .direction-tab, .paper-task, .ledger-task, .signal-card, .ledger-progress span { transition: none; }
}
</style>
