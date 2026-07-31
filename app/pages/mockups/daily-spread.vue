<template>
  <div class="spread-lab" :data-variation="activeVariation">
    <header class="spread-lab-header">
      <div class="spread-lab-kicker"><span class="spread-lab-mark">rc</span><span>daily spread / second study</span></div>
      <div class="spread-lab-title-row">
        <div>
          <h1>One page, three moods.</h1>
          <p>The same diary-first workflow, interpreted three ways for a phone that should feel like a personal journal.</p>
        </div>
        <span class="spread-lab-badge">mock data only</span>
      </div>
    </header>

    <nav class="spread-variation-picker" aria-label="Choose a daily spread variation">
      <button
        v-for="variation in variations"
        :key="variation.id"
        type="button"
        class="spread-variation-tab"
        :class="{ active: activeVariation === variation.id }"
        @click="setVariation(variation.id)">
        <span class="spread-variation-number">{{ variation.number }}</span>
        <span class="spread-variation-copy"><strong>{{ variation.name }}</strong><small>{{ variation.subtitle }}</small></span>
      </button>
    </nav>

    <main class="spread-lab-main">
      <aside class="spread-lab-brief">
        <div class="spread-brief-card">
          <span class="spread-brief-kicker">{{ activeMeta.number }} · {{ activeMeta.name }}</span>
          <h2>{{ activeMeta.headline }}</h2>
          <p>{{ activeMeta.description }}</p>
          <div class="spread-brief-rule" />
          <div class="spread-brief-row"><span>Feeling</span><strong>{{ activeMeta.feeling }}</strong></div>
          <div class="spread-brief-row"><span>Best moment</span><strong>{{ activeMeta.moment }}</strong></div>
          <div class="spread-brief-row"><span>Task treatment</span><strong>{{ activeMeta.tasks }}</strong></div>
        </div>
        <div class="spread-brief-note"><span /> <p>Tap a checkbox, switch a day, filter a workspace, or drag a row. Every interaction here is local mock state.</p></div>
      </aside>

      <section class="spread-phone-stage" aria-label="Daily spread mobile mockup">
        <div class="spread-phone">
          <div class="spread-phone-speaker" />

          <!-- Variation 1: Soft linen -->
          <div v-if="activeVariation === 'linen'" class="spread-screen linen-screen">
            <div class="linen-status"><span>9:41</span><span>▴ ▪︎ ▪︎</span></div>
            <div class="linen-page-label"><span>FIELD JOURNAL / 029</span><span>WEDNESDAY</span></div>
            <div class="linen-heading">
              <div><p class="linen-date">29 July 2026 · 08:42</p><h2>Today, gently.</h2><p class="linen-deck">Make room for the one useful thing.</p></div>
              <button type="button" class="linen-sun" aria-label="Open daily menu">☼</button>
            </div>
            <div class="linen-tabs" role="tablist" aria-label="Workspace filter"><button v-for="space in workspaceOptions" :key="space" type="button" :class="{ selected: activeWorkspace === space }" @click="activeWorkspace = space">{{ space }}</button></div>
            <div class="linen-days"><button v-for="day in days" :key="day.index" type="button" :class="{ selected: selectedDay === day.index }" @click="selectedDay = day.index"><span>{{ day.label }}</span><strong>{{ day.number }}</strong><i :class="{ marked: day.marked }" /></button></div>
            <section class="linen-section linen-note"><div class="linen-section-head"><span>Morning pages</span><button type="button" aria-label="Edit morning pages">✎</button></div><p>I want the system to feel like opening a notebook: one honest line, then the next useful thing.</p><i /><i class="short" /></section>
            <section class="linen-section linen-tasks"><div class="linen-section-head"><span>Today’s list</span><em>{{ openCount }} open · {{ doneCount }} done</em></div><div class="linen-task-list"><div v-for="task in displayedTasks" :key="task.id" class="linen-task" :class="{ done: task.done, dragging: draggingId === task.id }" draggable="true" @dragstart="beginDrag(task.id)" @dragover.prevent @drop="dropTask(task.id)"><button type="button" class="linen-check" :class="{ checked: task.done }" :aria-label="`Toggle ${task.title}`" @click="toggleTask(task.id)">{{ task.done ? '✓' : '' }}</button><div class="linen-task-copy"><strong>{{ task.title }}</strong><span>{{ task.meta }}<b v-if="task.subtasks"> · {{ task.subtasks }} subtasks</b></span></div><span class="linen-grip" aria-label="Drag to reorder">⠿</span></div></div><form class="linen-capture" @submit.prevent="addTask"><span>＋</span><input v-model="newTask" aria-label="Add a task" placeholder="Write the next thing…" /><button type="submit">add</button></form></section>
            <div class="linen-footer-note"><span>linked notes live in the margins</span><span>↗ {{ linkedCount }} links</span></div>
            <nav class="spread-mock-nav linen-nav" aria-label="Soft linen navigation"><button v-for="item in navItems" :key="item.id" type="button" :class="{ active: activeTab === item.id }" @click="activeTab = item.id"><span>{{ item.icon }}</span>{{ item.label }}</button></nav>
          </div>

          <!-- Variation 2: Studio grid -->
          <div v-else-if="activeVariation === 'studio'" class="spread-screen studio-screen">
            <div class="studio-topbar"><div class="studio-wordmark"><span>RC</span><strong>daybook</strong></div><div class="studio-top-actions"><button type="button" aria-label="Search">⌕</button><button type="button" aria-label="More options">•••</button></div></div>
            <div class="studio-rule" />
            <div class="studio-heading"><div><span class="studio-overline">WEDNESDAY / 29 JUL</span><h2>A useful day.</h2></div><span class="studio-page-no">p. 029</span></div>
            <div class="studio-tabs"><button v-for="space in workspaceOptions" :key="space" type="button" :class="{ selected: activeWorkspace === space }" @click="activeWorkspace = space">{{ space }}</button></div>
            <div class="studio-days"><button v-for="day in days" :key="day.index" type="button" :class="{ selected: selectedDay === day.index }" @click="selectedDay = day.index"><span>{{ day.label }}</span><strong>{{ day.number }}</strong><i :class="{ marked: day.marked }" /></button></div>
            <div class="studio-grid-line" />
            <section class="studio-entry"><div class="studio-section-label"><span>ENTRY / 08:42</span><button type="button" aria-label="Edit entry">EDIT</button></div><p>Start with the page. Let the tasks earn their place.</p><div class="studio-entry-lines"><i /><i /><i class="short" /></div></section>
            <section class="studio-task-section"><div class="studio-section-label"><span>OPEN ITEMS</span><em>{{ openCount }} / {{ tasks.length }}</em></div><div class="studio-task-list"><div v-for="task in displayedTasks" :key="task.id" class="studio-task" :class="{ done: task.done, dragging: draggingId === task.id }" draggable="true" @dragstart="beginDrag(task.id)" @dragover.prevent @drop="dropTask(task.id)"><span class="studio-task-time">{{ task.time }}</span><button type="button" class="studio-check" :class="{ checked: task.done }" :aria-label="`Toggle ${task.title}`" @click="toggleTask(task.id)">{{ task.done ? '✓' : '' }}</button><div class="studio-task-copy"><strong>{{ task.title }}</strong><span>{{ task.tag }} · {{ task.meta }}</span></div><span class="studio-grip" aria-label="Drag to reorder">⋮⋮</span></div></div><form class="studio-capture" @submit.prevent="addTask"><span class="studio-plus">+</span><input v-model="newTask" aria-label="Add a task" placeholder="Add to the page" /><button type="submit">↵</button></form></section>
            <section class="studio-margin-card"><span>NOTEBOOK MARGIN</span><p>“The system should disappear behind the day.”</p><small>{{ linkedCount }} linked tasks · edited 08:42</small></section>
            <nav class="spread-mock-nav studio-nav" aria-label="Studio grid navigation"><button v-for="item in navItems" :key="item.id" type="button" :class="{ active: activeTab === item.id }" @click="activeTab = item.id"><span>{{ item.icon }}</span><b>{{ item.label }}</b></button></nav>
          </div>

          <!-- Variation 3: After hours -->
          <div v-else class="spread-screen after-hours-screen">
            <div class="after-hours-glow glow-one" /><div class="after-hours-glow glow-two" />
            <div class="after-hours-topbar"><div class="after-hours-mark"><span>✳</span><strong>daybook</strong></div><button type="button" aria-label="Open daily menu">◎</button></div>
            <div class="after-hours-date"><span>WED · 29 JUL</span><small>18:24</small></div>
            <h2>Keep the thread.</h2><p class="after-hours-deck">A softer page for closing the day and carrying only what matters forward.</p>
            <div class="after-hours-tabs"><button v-for="space in workspaceOptions" :key="space" type="button" :class="{ selected: activeWorkspace === space }" @click="activeWorkspace = space">{{ space }}</button></div>
            <div class="after-hours-days"><button v-for="day in days" :key="day.index" type="button" :class="{ selected: selectedDay === day.index }" @click="selectedDay = day.index"><span>{{ day.label }}</span><strong>{{ day.number }}</strong><i :class="{ marked: day.marked }" /></button></div>
            <section class="after-hours-quote"><span>TONIGHT’S NOTE</span><p>“What felt lighter after I wrote it down?”</p><button type="button" aria-label="Edit tonight's note">✎</button></section>
            <section class="after-hours-tasks"><div class="after-hours-section-head"><span>THREADS TO CARRY</span><em>{{ openCount }} open</em></div><div class="after-hours-task-list"><div v-for="task in displayedTasks" :key="task.id" class="after-hours-task" :class="{ done: task.done, dragging: draggingId === task.id }" draggable="true" @dragstart="beginDrag(task.id)" @dragover.prevent @drop="dropTask(task.id)"><button type="button" class="after-hours-check" :class="{ checked: task.done }" :aria-label="`Toggle ${task.title}`" @click="toggleTask(task.id)">{{ task.done ? '✓' : '' }}</button><div><strong>{{ task.title }}</strong><span>{{ task.tag }} · {{ task.meta }}</span></div><span class="after-hours-grip">⠿</span></div></div><form class="after-hours-capture" @submit.prevent="addTask"><span>+</span><input v-model="newTask" aria-label="Add a thread" placeholder="Leave a thread for tomorrow" /><button type="submit">↗</button></form></section>
            <div class="after-hours-footer-note"><span>p. 029 / 365</span><span>{{ linkedCount }} links</span></div>
            <nav class="spread-mock-nav after-hours-nav" aria-label="After hours navigation"><button v-for="item in navItems" :key="item.id" type="button" :class="{ active: activeTab === item.id }" @click="activeTab = item.id"><span>{{ item.icon }}</span>{{ item.label }}</button></nav>
          </div>

          <div class="spread-phone-home-indicator" />
        </div>
      </section>
    </main>

    <footer class="spread-lab-footer"><span>Same core: diary · tasks · links · workspaces</span><span>Choose the mood before we choose the architecture.</span></footer>
  </div>
</template>

<script setup lang="ts">
const variations = [
  { id: 'linen', number: '01', name: 'Soft linen', subtitle: 'the warm original', headline: 'The most like a real notebook.', description: 'A gentle, tactile spread with a red margin, loose writing space, and tasks that feel written into the page.', feeling: 'warm + forgiving', moment: 'morning check-in', tasks: 'handwritten list' },
  { id: 'studio', number: '02', name: 'Studio grid', subtitle: 'editorial + precise', headline: 'A notebook with a ruler.', description: 'The same paper ritual, tightened into a crisp editorial page. Time, labels, and task rows make execution easier to scan.', feeling: 'clear + composed', moment: 'busy workday', tasks: 'structured rows' },
  { id: 'after-hours', number: '03', name: 'After hours', subtitle: 'quiet evening paper', headline: 'A page that helps you let go.', description: 'A duskier journal variation for closing loops, leaving a thread for tomorrow, and keeping the diary emotionally present.', feeling: 'quiet + reflective', moment: 'end-of-day reset', tasks: 'carry-forward threads' },
];

const activeVariation = ref('after-hours');
const activeWorkspace = ref('All');
const activeTab = ref('Today');
const selectedDay = ref(2);
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
  { id: 'Week', label: 'Week', icon: '▦' },
];
const tasks = ref([
  { id: 'brief', title: 'Close the product brief', meta: 'due today · 2/3', tag: 'FOCUS', time: '09:00', workspace: 'Work', done: false, subtasks: 3 },
  { id: 'groceries', title: 'Pick up groceries', meta: 'before 18:00', tag: 'LIFE', time: '17:30', workspace: 'Personal', done: false },
  { id: 'reply', title: 'Reply to design review', meta: '10 min', tag: 'WORK', time: '11:20', workspace: 'Work', done: true },
  { id: 'walk', title: 'Walk without the phone', meta: 'evening ritual', tag: 'RESET', time: '20:00', workspace: 'Personal', done: false },
]);

const activeMeta = computed(() => variations.find(item => item.id === activeVariation.value));
const displayedTasks = computed(() => activeWorkspace.value === 'All' ? tasks.value : tasks.value.filter(task => task.workspace === activeWorkspace.value));
const doneCount = computed(() => tasks.value.filter(task => task.done).length);
const openCount = computed(() => tasks.value.filter(task => !task.done).length);
const linkedCount = computed(() => tasks.value.filter(task => task.tag === 'FOCUS' || task.tag === 'WORK').length);

function setVariation(id) {
  activeVariation.value = id;
  draggingId.value = null;
}

function toggleTask(id) {
  const task = tasks.value.find(item => item.id === id);
  if (task) task.done = !task.done;
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

function addTask() {
  const title = newTask.value.trim();
  if (!title) return;
  tasks.value.unshift({
    id: `new-${Date.now()}`,
    title,
    meta: 'just captured',
    tag: activeWorkspace.value === 'Work' ? 'WORK' : 'LIFE',
    time: 'now',
    workspace: activeWorkspace.value === 'All' ? 'Personal' : activeWorkspace.value,
    done: false,
  });
  newTask.value = '';
}
</script>

<style>
.spread-lab {
  --spread-ink: #27251f;
  --spread-muted: #78746d;
  min-height: 100vh;
  padding: 36px clamp(16px, 4vw, 60px) 32px;
  color: var(--spread-ink);
  background: #e9e6de;
  font-family: var(--daybook-serif);
}

.spread-lab-header,
.spread-variation-picker,
.spread-lab-main,
.spread-lab-footer { width: min(1180px, 100%); margin-inline: auto; }
.spread-lab-kicker,
.spread-lab-title-row,
.spread-variation-tab,
.spread-brief-row,
.linen-page-label,
.linen-heading,
.linen-section-head,
.linen-footer-note,
.studio-topbar,
.studio-heading,
.studio-section-label,
.studio-task,
.after-hours-topbar,
.after-hours-date,
.after-hours-section-head,
.after-hours-footer-note,
.spread-lab-footer { display: flex; align-items: center; }
.spread-lab-kicker { gap: 8px; color: #7d7b75; font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .16em; text-transform: uppercase; }
.spread-lab-mark { display: grid; width: 26px; height: 26px; place-items: center; border-radius: 9px; background: #292820; color: #f2efe6; font-size: 11px; letter-spacing: -.05em; text-transform: lowercase; }
.spread-lab-title-row { justify-content: space-between; gap: 24px; margin-top: 22px; }
.spread-lab-title-row h1 { max-width: 680px; margin: 0; color: #292820; font-size: clamp(30px, 5vw, 56px); font-weight: 650; letter-spacing: -.055em; line-height: .98; }
.spread-lab-title-row p { max-width: 560px; margin: 14px 0 0; color: #77746d; font-size: 15px; line-height: 1.55; }
.spread-lab-badge { flex: 0 0 auto; padding: 7px 10px; border: 1px solid rgba(39, 37, 31, .14); border-radius: 999px; color: #77746d; font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
.spread-variation-picker { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 34px; }
.spread-variation-tab { min-width: 0; gap: 12px; padding: 14px; border: 1px solid rgba(39, 37, 31, .12); border-radius: 16px; background: rgba(255,255,255,.34); color: #77746d; text-align: left; transition: 180ms ease; }
.spread-variation-tab:hover, .spread-variation-tab.active { border-color: #292820; background: #f7f5ef; color: #292820; transform: translateY(-2px); }
.spread-variation-number { color: #9d9a92; font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
.spread-variation-copy { display: grid; gap: 3px; min-width: 0; }
.spread-variation-copy strong { overflow: hidden; color: inherit; font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.spread-variation-copy small { overflow: hidden; color: #9b9890; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.spread-lab-main { display: grid; grid-template-columns: minmax(230px, .75fr) minmax(360px, 1fr); align-items: start; gap: clamp(30px, 8vw, 120px); margin-top: 44px; }
.spread-lab-brief { position: sticky; top: 28px; }
.spread-brief-card { padding: 24px; border: 1px solid rgba(39, 37, 31, .12); border-radius: 20px; background: rgba(255,255,255,.4); }
.spread-brief-kicker { color: #77746d; font: 700 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; }
.spread-brief-card h2 { margin: 18px 0 10px; color: #292820; font-size: 25px; font-weight: 650; letter-spacing: -.04em; line-height: 1.05; }
.spread-brief-card p, .spread-brief-note p { margin: 0; color: #77746d; font-size: 13px; line-height: 1.55; }
.spread-brief-rule { height: 1px; margin: 22px 0 5px; background: rgba(39,37,31,.12); }
.spread-brief-row { justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(39,37,31,.08); color: #9b9890; font-size: 11px; }
.spread-brief-row:last-child { border-bottom: 0; }
.spread-brief-row strong { color: #292820; font-size: 11px; font-weight: 700; text-align: right; }
.spread-brief-note { display: flex; gap: 10px; margin: 18px 6px; }
.spread-brief-note > span { flex: 0 0 auto; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: #c87563; }
.spread-phone-stage { display: grid; place-items: start center; }
.spread-phone { position: relative; width: min(390px, 100%); padding: 10px; border-radius: 44px; background: #292820; box-shadow: 0 26px 80px rgba(35,33,29,.25), 0 3px 0 rgba(255,255,255,.8) inset; }
.spread-phone-speaker { position: absolute; z-index: 3; top: 18px; left: 50%; width: 74px; height: 22px; border-radius: 999px; background: #292820; transform: translateX(-50%); }
.spread-phone-home-indicator { position: absolute; z-index: 3; bottom: 18px; left: 50%; width: 108px; height: 4px; border-radius: 999px; background: rgba(255,255,255,.72); transform: translateX(-50%); }
.spread-screen { position: relative; min-height: 790px; overflow: hidden; border-radius: 35px; }
.spread-screen button, .spread-screen input { font: inherit; }
.spread-screen button { cursor: pointer; }
.spread-screen button:focus-visible, .spread-screen input:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.spread-screen input::placeholder { opacity: .55; }
.spread-mock-nav { position: absolute; right: 18px; bottom: 18px; left: 18px; z-index: 2; display: grid; grid-template-columns: repeat(4,1fr); align-items: center; min-height: 58px; }
.spread-mock-nav button { display: grid; justify-items: center; gap: 3px; border: 0; background: transparent; font-size: 9px; }
.spread-mock-nav button span { font-size: 17px; line-height: 1; }
.spread-mock-nav button.active { font-weight: 750; }

/* 01 — Soft linen */
.linen-screen { padding: 26px 20px 96px; color: #342f29; background: #f4ecd9; background-image: linear-gradient(rgba(190,166,127,.09) 1px, transparent 1px), radial-gradient(rgba(104,80,45,.035) .7px, transparent .7px); background-position: 0 28px, 0 0; background-size: 100% 29px, 5px 5px; font-family: var(--daybook-serif); }
.linen-screen::before { position: absolute; top: 0; bottom: 0; left: 39px; width: 1px; background: rgba(205,106,89,.23); content: ""; }
.linen-screen > *:not(.spread-mock-nav), .linen-nav { position: relative; z-index: 1; }
.linen-status { display: flex; justify-content: space-between; padding: 2px 4px 17px 13px; color: rgba(52,47,41,.5); font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.linen-page-label { justify-content: space-between; margin: 10px 0 19px 13px; color: rgba(52,47,41,.5); font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .09em; }
.linen-heading { align-items: flex-start; justify-content: space-between; margin-left: 13px; }
.linen-date { margin: 0 0 8px; color: #b26657; font-size: 12px; font-style: italic; }
.linen-heading h2 { margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -.05em; line-height: .95; }
.linen-deck { max-width: 230px; margin: 10px 0 0; color: rgba(52,47,41,.65); font-size: 12px; line-height: 1.45; }
.linen-sun { display: grid; width: 39px; height: 39px; place-items: center; border: 1px solid rgba(52,47,41,.2); border-radius: 50%; background: rgba(255,250,232,.38); color: #b26657; font-size: 20px; }
.linen-tabs { display: flex; gap: 6px; margin: 24px 0 14px 13px; overflow: auto; scrollbar-width: none; }
.linen-tabs::-webkit-scrollbar { display: none; }
.linen-tabs button { padding: 6px 10px; border: 1px solid rgba(52,47,41,.17); border-radius: 999px; background: transparent; color: rgba(52,47,41,.6); font-size: 10px; }
.linen-tabs button.selected { border-color: #342f29; background: #342f29; color: #f4ecd9; }
.linen-days { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; margin: 0 0 17px 13px; padding: 9px 0 12px; border-top: 1px solid rgba(52,47,41,.13); border-bottom: 1px solid rgba(52,47,41,.13); }
.linen-days button { display: grid; justify-items: center; gap: 4px; padding: 4px 0; border: 0; background: transparent; color: rgba(52,47,41,.52); }
.linen-days button span { font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.linen-days button strong { font-size: 15px; }
.linen-days button i { width: 4px; height: 4px; border-radius: 50%; background: transparent; }
.linen-days button i.marked { background: #b26657; }
.linen-days button.selected { color: #b26657; }
.linen-days button.selected strong { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.linen-section { position: relative; margin-left: 13px; }
.linen-section + .linen-section { margin-top: 24px; }
.linen-section-head { justify-content: space-between; margin-bottom: 8px; color: #b26657; font-size: 12px; font-weight: 700; }
.linen-section-head em { color: rgba(52,47,41,.48); font-size: 10px; font-style: normal; font-weight: 400; }
.linen-section-head button { border: 0; background: transparent; color: #b26657; font-size: 17px; }
.linen-note p { max-width: 290px; margin: 0; color: rgba(52,47,41,.78); font-size: 13px; line-height: 1.7; }
.linen-note > i { display: block; width: 82%; height: 1px; margin-top: 9px; background: rgba(52,47,41,.13); }
.linen-note > i.short { width: 55%; }
.linen-task-list { display: grid; gap: 2px; }
.linen-task { display: flex; align-items: flex-start; gap: 9px; min-height: 42px; padding: 8px 5px 8px 1px; border-bottom: 1px dashed rgba(52,47,41,.18); transition: 150ms ease; }
.linen-task.dragging { opacity: .45; background: rgba(178,102,87,.1); }
.linen-check { flex: 0 0 auto; width: 18px; height: 18px; margin-top: 1px; border: 1px solid #6e665f; border-radius: 50%; background: transparent; color: #b26657; font-size: 13px; line-height: 1; }
.linen-check.checked { border-color: #b26657; background: #b26657; color: #f4ecd9; }
.linen-task-copy { display: grid; flex: 1; min-width: 0; gap: 2px; }
.linen-task-copy strong { overflow: hidden; font-size: 13px; font-weight: 600; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.linen-task-copy span { color: rgba(52,47,41,.52); font: 10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
.linen-task-copy b { color: #b26657; font-weight: 700; }
.linen-task.done .linen-task-copy strong { color: rgba(52,47,41,.45); text-decoration: line-through; }
.linen-grip { padding-top: 1px; color: rgba(52,47,41,.35); font-size: 18px; letter-spacing: -5px; }
.linen-capture { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 6px; border-bottom: 1px solid rgba(178,102,87,.42); color: #b26657; }
.linen-capture input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #342f29; font-size: 12px; }
.linen-capture button { border: 0; background: transparent; color: #b26657; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.linen-footer-note { justify-content: space-between; margin: 23px 0 0 13px; color: rgba(52,47,41,.42); font-size: 10px; font-style: italic; }
.linen-nav { border-top: 1px solid rgba(52,47,41,.18); background: linear-gradient(to top, rgba(244,236,217,.98), rgba(244,236,217,.75)); color: rgba(52,47,41,.5); }
.linen-nav button.active { color: #b26657; }

/* 02 — Studio grid */
.studio-screen { padding: 43px 20px 96px; color: #242a2e; background: #f2f0ea; background-image: radial-gradient(rgba(44,55,58,.12) .7px, transparent .7px); background-size: 5px 5px; font-family: var(--daybook-serif); }
.studio-screen::before { position: absolute; top: 0; bottom: 0; left: 48px; width: 1px; background: rgba(214,102,75,.23); content: ""; }
.studio-screen > *:not(.spread-mock-nav) { position: relative; z-index: 1; }
.studio-topbar { justify-content: space-between; margin-left: 13px; }
.studio-wordmark { display: flex; align-items: baseline; gap: 7px; color: #242a2e; letter-spacing: -.04em; }
.studio-wordmark span { color: #d0664d; font: 800 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; }
.studio-wordmark strong { font-size: 14px; font-weight: 700; }
.studio-top-actions { display: flex; gap: 4px; }
.studio-top-actions button { width: 29px; height: 29px; border: 1px solid rgba(36,42,46,.15); border-radius: 8px; background: rgba(255,255,255,.35); color: #70787a; }
.studio-rule { height: 1px; margin: 21px 0 24px 13px; background: rgba(36,42,46,.19); }
.studio-heading { align-items: flex-end; justify-content: space-between; margin-left: 13px; }
.studio-overline, .studio-section-label span { color: #798184; font: 700 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; }
.studio-heading h2 { margin: 9px 0 0; color: #242a2e; font: 650 31px/.95 Georgia, "Times New Roman", serif; letter-spacing: -.05em; }
.studio-page-no { color: #d0664d; font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.studio-tabs { display: flex; gap: 5px; margin: 24px 0 14px 13px; }
.studio-tabs button { padding: 6px 9px; border: 1px solid rgba(36,42,46,.15); border-radius: 4px; background: transparent; color: #798184; font-size: 10px; }
.studio-tabs button.selected { border-color: #2d6b72; background: #2d6b72; color: #f2f0ea; }
.studio-days { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; margin-left: 13px; padding: 9px 0 12px; border-top: 1px solid rgba(36,42,46,.18); border-bottom: 1px solid rgba(36,42,46,.18); }
.studio-days button { display: grid; justify-items: center; gap: 5px; padding: 4px 0; border: 0; background: transparent; color: #8b9293; }
.studio-days button span { font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.studio-days button strong { font-size: 13px; font-weight: 700; }
.studio-days button i { width: 4px; height: 4px; border-radius: 50%; background: transparent; }
.studio-days button i.marked { background: #d0664d; }
.studio-days button.selected { color: #2d6b72; }
.studio-days button.selected strong { text-decoration: underline; text-decoration-color: #d0664d; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.studio-grid-line { height: 1px; margin: 20px 0 19px 13px; background: rgba(36,42,46,.1); }
.studio-entry, .studio-task-section { margin-left: 13px; }
.studio-entry { padding: 0 0 20px; border-bottom: 1px solid rgba(36,42,46,.13); }
.studio-section-label { justify-content: space-between; margin-bottom: 10px; }
.studio-section-label button { border: 0; background: transparent; color: #d0664d; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; }
.studio-section-label em { color: #8b9293; font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; font-style: normal; }
.studio-entry p { max-width: 280px; margin: 0; color: #4b5658; font: 14px/1.5 Georgia, "Times New Roman", serif; }
.studio-entry-lines { display: grid; gap: 8px; margin-top: 13px; }
.studio-entry-lines i { display: block; width: 88%; height: 1px; background: rgba(36,42,46,.12); }
.studio-entry-lines i.short { width: 61%; }
.studio-task-section { margin-top: 20px; }
.studio-task-list { display: grid; gap: 0; }
.studio-task { gap: 9px; min-height: 50px; padding: 9px 5px 9px 0; border-bottom: 1px solid rgba(36,42,46,.12); transition: 150ms ease; }
.studio-task.dragging { opacity: .45; background: rgba(45,107,114,.08); }
.studio-task-time { width: 32px; color: #9a9d9a; font: 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.studio-check { display: grid; flex: 0 0 auto; width: 19px; height: 19px; place-items: center; border: 1px solid #718084; border-radius: 4px; background: transparent; color: #f2f0ea; font-size: 12px; line-height: 1; }
.studio-check.checked { border-color: #2d6b72; background: #2d6b72; }
.studio-task-copy { display: grid; flex: 1; min-width: 0; gap: 3px; }
.studio-task-copy strong { overflow: hidden; color: #2d3639; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.studio-task-copy span { color: #929896; font: 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
.studio-task.done .studio-task-copy strong { color: #9da29f; text-decoration: line-through; }
.studio-grip { color: #afb3af; font-size: 15px; letter-spacing: -4px; }
.studio-capture { display: flex; align-items: center; gap: 8px; margin-top: 11px; padding: 9px 8px; border-bottom: 1px solid #2d6b72; background: rgba(45,107,114,.05); }
.studio-plus { color: #2d6b72; font-size: 19px; line-height: 1; }
.studio-capture input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #2d3639; font-size: 11px; }
.studio-capture button { border: 0; background: transparent; color: #2d6b72; font-size: 18px; line-height: 1; }
.studio-margin-card { margin: 19px 0 0 13px; padding: 12px; border: 1px solid rgba(208,102,77,.35); background: rgba(208,102,77,.06); }
.studio-margin-card > span { color: #d0664d; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .13em; }
.studio-margin-card p { margin: 10px 0 8px; color: #465154; font: 15px/1.25 Georgia, "Times New Roman", serif; font-style: italic; }
.studio-margin-card small { color: #929896; font: 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.studio-nav { border: 1px solid rgba(36,42,46,.14); background: rgba(242,240,234,.93); color: #8b9293; }
.studio-nav button { font-size: 8px; }
.studio-nav button span { font-size: 16px; }
.studio-nav button.active { color: #2d6b72; }

/* 03 — After hours */
.after-hours-screen { padding: 43px 19px 96px; color: #efe8d7; background: #1f2927; background-image: linear-gradient(rgba(239,232,215,.045) 1px, transparent 1px), radial-gradient(rgba(239,232,215,.05) .7px, transparent .7px); background-size: 100% 31px, 6px 6px; font-family: var(--daybook-serif); }
.after-hours-screen::before { position: absolute; top: 0; bottom: 0; left: 38px; width: 1px; background: rgba(213,123,92,.27); content: ""; }
.after-hours-screen > *:not(.after-hours-glow):not(.spread-mock-nav) { position: relative; z-index: 1; }
.after-hours-glow { position: absolute; border-radius: 50%; pointer-events: none; }
.glow-one { top: -130px; right: -105px; width: 280px; height: 280px; background: radial-gradient(circle, rgba(202,126,91,.16), transparent 65%); }
.glow-two { top: 180px; left: -135px; width: 260px; height: 260px; background: radial-gradient(circle, rgba(100,157,139,.13), transparent 66%); }
.after-hours-topbar { justify-content: space-between; margin-left: 13px; }
.after-hours-mark { display: flex; align-items: center; gap: 7px; color: #efe8d7; font-size: 13px; letter-spacing: -.03em; }
.after-hours-mark span { display: grid; width: 23px; height: 23px; place-items: center; border-radius: 8px; background: #d57b5c; color: #1f2927; font-size: 13px; }
.after-hours-topbar > button { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid rgba(239,232,215,.22); border-radius: 50%; background: transparent; color: #b7b19f; }
.after-hours-date { justify-content: space-between; margin: 38px 0 0 13px; color: #c2baa7; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .15em; }
.after-hours-date small { color: #7f8d85; font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0; }
.after-hours-screen h2 { margin: 14px 0 7px 13px; color: #fff8e8; font: 650 31px/.96 Georgia, "Times New Roman", serif; letter-spacing: -.05em; }
.after-hours-deck { max-width: 260px; margin: 0 0 0 13px; color: #a9ad9e; font: 13px/1.5 Georgia, "Times New Roman", serif; }
.after-hours-tabs { display: flex; gap: 6px; margin: 24px 0 14px 13px; }
.after-hours-tabs button { padding: 6px 10px; border: 1px solid rgba(239,232,215,.17); border-radius: 999px; background: transparent; color: #99a298; font-size: 10px; }
.after-hours-tabs button.selected { border-color: #d57b5c; background: #d57b5c; color: #1f2927; }
.after-hours-days { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; margin-left: 13px; padding: 9px 0 12px; border-top: 1px solid rgba(239,232,215,.15); border-bottom: 1px solid rgba(239,232,215,.15); }
.after-hours-days button { display: grid; justify-items: center; gap: 5px; padding: 4px 0; border: 0; background: transparent; color: #7f8d85; }
.after-hours-days button span { font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.after-hours-days button strong { font-size: 13px; font-weight: 650; }
.after-hours-days button i { width: 4px; height: 4px; border-radius: 50%; background: transparent; }
.after-hours-days button i.marked { background: #d57b5c; }
.after-hours-days button.selected { color: #efe8d7; }
.after-hours-days button.selected strong { text-decoration: underline; text-decoration-color: #d57b5c; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.after-hours-quote { position: relative; margin: 22px 0 0 13px; padding: 14px 36px 14px 12px; border-left: 2px solid #d57b5c; background: rgba(213,123,92,.08); }
.after-hours-quote span, .after-hours-section-head span { color: #d5947a; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .13em; }
.after-hours-quote p { margin: 9px 0 0; color: #e6dec9; font: 15px/1.3 Georgia, "Times New Roman", serif; font-style: italic; }
.after-hours-quote button { position: absolute; top: 12px; right: 10px; border: 0; background: transparent; color: #d57b5c; font-size: 16px; }
.after-hours-tasks { margin: 24px 0 0 13px; }
.after-hours-section-head { justify-content: space-between; margin-bottom: 9px; }
.after-hours-section-head em { color: #7f8d85; font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; font-style: normal; }
.after-hours-task-list { display: grid; gap: 5px; }
.after-hours-task { display: flex; align-items: flex-start; gap: 9px; min-height: 48px; padding: 9px 7px 9px 0; border-bottom: 1px dashed rgba(239,232,215,.18); transition: 150ms ease; }
.after-hours-task.dragging { opacity: .45; background: rgba(213,123,92,.1); }
.after-hours-check { display: grid; flex: 0 0 auto; width: 19px; height: 19px; place-items: center; border: 1px solid #7f8d85; border-radius: 50%; background: transparent; color: #1f2927; font-size: 12px; }
.after-hours-check.checked { border-color: #d57b5c; background: #d57b5c; }
.after-hours-task > div { display: grid; flex: 1; min-width: 0; gap: 4px; }
.after-hours-task strong { overflow: hidden; color: #e9e2d1; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.after-hours-task span { overflow: hidden; color: #85928a; font: 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.after-hours-task.done { opacity: .5; }
.after-hours-task.done strong { text-decoration: line-through; }
.after-hours-grip { padding-top: 1px; color: #64736d; font-size: 17px; letter-spacing: -5px; }
.after-hours-capture { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 9px 8px; border-bottom: 1px solid rgba(213,123,92,.65); color: #d57b5c; }
.after-hours-capture > span { font-size: 20px; line-height: 1; }
.after-hours-capture input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #efe8d7; font-size: 11px; }
.after-hours-capture button { border: 0; background: transparent; color: #d57b5c; font-size: 17px; }
.after-hours-footer-note { justify-content: space-between; margin: 22px 0 0 13px; color: #718078; font: 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.after-hours-nav { border: 1px solid rgba(239,232,215,.13); border-radius: 17px; background: rgba(23,32,30,.92); color: #7f8d85; }
.after-hours-nav button { font-size: 8px; }
.after-hours-nav button span { font-size: 16px; }
.after-hours-nav button.active { color: #d57b5c; }

.spread-lab-footer { justify-content: space-between; gap: 20px; margin-top: 40px; padding-top: 19px; border-top: 1px solid rgba(39,37,31,.12); color: #89867e; font-size: 11px; }

@media (max-width: 780px) {
  .spread-lab { padding: 22px 14px 24px; }
  .spread-lab-title-row { align-items: flex-start; flex-direction: column; gap: 14px; }
  .spread-lab-title-row p { font-size: 13px; }
  .spread-lab-badge { align-self: flex-start; }
  .spread-variation-picker { margin-top: 24px; }
  .spread-variation-tab { padding: 11px 9px; gap: 8px; }
  .spread-variation-copy strong { font-size: 11px; }
  .spread-variation-copy small { font-size: 9px; }
  .spread-lab-main { display: flex; flex-direction: column; gap: 22px; margin-top: 26px; }
  .spread-lab-brief { position: static; order: 2; }
  .spread-phone-stage { order: 1; width: 100%; }
  .spread-brief-card { padding: 18px; }
  .spread-brief-card h2 { font-size: 22px; }
  .spread-lab-footer { align-items: flex-start; flex-direction: column; gap: 5px; margin-top: 28px; }
}

@media (max-width: 430px) {
  .spread-variation-picker { grid-template-columns: 1fr; }
  .spread-variation-tab { min-height: 54px; }
  .spread-variation-copy strong { font-size: 12px; }
  .spread-variation-copy small { font-size: 10px; }
  .spread-phone { padding: 7px; border-radius: 35px; }
  .spread-screen { min-height: 760px; border-radius: 29px; }
  .linen-screen, .studio-screen, .after-hours-screen { padding-top: 36px; }
}

@media (prefers-reduced-motion: reduce) {
  .spread-variation-tab, .linen-task, .studio-task, .after-hours-task { transition: none; }
}
</style>
