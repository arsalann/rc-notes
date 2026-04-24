<template>
  <div class="max-w-lg mx-auto min-h-screen">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg px-4 pt-5 pb-3 safe-top">
      <div class="flex items-center gap-3">
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" to="/notes" />
        <h1 class="text-2xl font-bold tracking-tight">Diary</h1>
        <WorkspaceSwitcher />
      </div>
    </div>

    <!-- Day selector -->
    <div class="flex gap-1.5 px-3 mt-3 no-scrollbar overflow-x-auto scroll-hint">
      <button v-for="day in days" :key="day.date" @click="selectDay(day.date)"
        class="flex flex-col items-center flex-1 min-w-[3.25rem] px-1.5 py-3 rounded-2xl transition-all duration-200 active:scale-95"
        :class="selectedDate === day.date
          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
          : day.isToday
            ? 'bg-(--ui-bg-elevated) ring-1 ring-(--ui-primary)/40'
            : 'bg-(--ui-bg-elevated) ring-1 ring-(--ui-border)'">
        <span class="text-[10px] uppercase font-semibold tracking-wide"
          :class="selectedDate === day.date ? 'text-white/70' : 'text-(--ui-text-dimmed)'">{{ day.dayName }}</span>
        <span class="text-lg font-bold mt-0.5">{{ day.dayNum }}</span>
        <div v-if="day.hasContent" class="w-1.5 h-1.5 rounded-full mt-1"
          :class="selectedDate === day.date ? 'bg-white/60' : 'bg-(--ui-primary)'" />
      </button>
    </div>

    <!-- Day label + edit toggle -->
    <div class="px-4 mt-5 flex items-center justify-between">
      <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed)">{{ selectedDayLabel }}</p>
      <div class="flex items-center gap-1">
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-plus" @click="showAddTask = !showAddTask">
          Task
        </UButton>
        <UButton :color="editMode ? 'primary' : 'neutral'" :variant="editMode ? 'soft' : 'ghost'" size="sm"
          :icon="editMode ? 'i-lucide-eye' : 'i-lucide-pencil'" :loading="creatingTasks" @click="toggleEditMode">
          {{ editMode ? 'Preview' : 'Edit' }}
        </UButton>
      </div>
    </div>

    <!-- Task sort/group toolbar -->
    <div class="flex items-center gap-1.5 px-4 mt-3 overflow-x-auto no-scrollbar scroll-hint pb-0.5">
      <span class="text-[10px] uppercase font-semibold tracking-wide text-(--ui-text-dimmed) shrink-0 mr-1">Sort</span>
      <UButton :color="taskSort === 'created' ? 'primary' : 'neutral'" :variant="taskSort === 'created' ? 'soft' : 'outline'" size="xs"
        icon="i-lucide-clock" @click="taskSort = 'created'" class="shrink-0">
        Newest
      </UButton>
      <UButton :color="taskSort === 'priority' ? 'primary' : 'neutral'" :variant="taskSort === 'priority' ? 'soft' : 'outline'" size="xs"
        icon="i-lucide-flame" @click="taskSort = 'priority'" class="shrink-0">
        Priority
      </UButton>
      <USeparator orientation="vertical" class="h-4 shrink-0" />
      <span class="text-[10px] uppercase font-semibold tracking-wide text-(--ui-text-dimmed) shrink-0 mr-1">Group</span>
      <UButton :color="taskGroup === 'created' ? 'primary' : 'neutral'" :variant="taskGroup === 'created' ? 'soft' : 'outline'" size="xs"
        icon="i-lucide-calendar-days" @click="taskGroup = taskGroup === 'created' ? 'none' : 'created'" class="shrink-0">
        Created
      </UButton>
      <UButton :color="taskGroup === 'priority' ? 'primary' : 'neutral'" :variant="taskGroup === 'priority' ? 'soft' : 'outline'" size="xs"
        icon="i-lucide-flame" @click="taskGroup = taskGroup === 'priority' ? 'none' : 'priority'" class="shrink-0">
        Priority
      </UButton>
    </div>

    <!-- Quick add task -->
    <div v-if="showAddTask" class="mt-3 -mx-0">
      <QuickAdd placeholder="Add a task for this day..." @add="handleAddTask" />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-4 mt-4">
      <USkeleton class="h-40 w-full" />
    </div>

    <div v-else class="px-4 mt-3 pb-8 space-y-6">
      <!-- Notes section -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-2">Notes</p>

        <!-- Edit mode -->
        <div v-if="editMode" class="relative">
          <Transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
            leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
            <div v-if="saving" class="absolute top-2 right-2 flex items-center gap-1.5 text-xs text-(--ui-text-dimmed)">
              <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" /> Saving
            </div>
          </Transition>
          <textarea v-model="editContent" @input="handleContentInput" @blur="saveContent" @keydown.escape="mentionOpen = false" ref="contentRef"
            class="w-full leading-7 bg-transparent outline-none resize-none text-(--ui-text-muted) min-h-[160px] placeholder:text-(--ui-text-dimmed) font-mono"
            placeholder="Write about your day... Type @ to link a task or note" />
          <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0 -translate-y-1">
            <UCard v-if="mentionOpen && mentionResults.length" class="absolute left-0 right-0 z-50 max-h-48 overflow-y-auto overscroll-contain" :ui="{ body: 'p-1' }" style="top:0">
              <button v-for="item in mentionResults" :key="item.id" @mousedown.prevent="insertMention(item)"
                class="w-full px-3 py-3 text-left text-sm flex items-center gap-2 rounded-lg transition-colors active:bg-(--ui-bg-elevated)">
                <UBadge :color="item.type === 'task' ? 'primary' : 'neutral'" variant="subtle" size="xs">{{ item.type === 'task' ? 'Task' : 'Note' }}</UBadge>
                <span class="truncate">{{ item.title }}</span>
                <span class="text-xs text-(--ui-text-dimmed) font-mono ml-auto shrink-0">{{ item.display_id }}</span>
              </button>
            </UCard>
          </Transition>
        </div>

        <!-- Preview mode -->
        <div v-else>
          <div v-if="notesHtml" class="prose prose-invert prose-sm max-w-none
            prose-headings:text-(--ui-text) prose-p:text-(--ui-text-muted) prose-p:leading-7
            prose-a:text-(--ui-primary) prose-strong:text-(--ui-text)
            prose-code:text-(--ui-primary) prose-code:bg-(--ui-bg-elevated) prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-(--ui-bg-elevated) prose-pre:border prose-pre:border-(--ui-border)
            prose-li:text-(--ui-text-muted) prose-blockquote:border-(--ui-border) prose-blockquote:text-(--ui-text-dimmed)
            prose-hr:border-(--ui-border)"
            v-html="notesHtml" />
          <p v-else class="text-sm text-(--ui-text-dimmed) italic">No notes yet. Tap the pencil to write.</p>
        </div>
      </div>

      <!-- Tasks section -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-2">Tasks</p>
        <template v-if="pendingGroups.length">
          <div v-for="group in pendingGroups" :key="group.key" class="mb-4 last:mb-0">
            <p v-if="taskGroup !== 'none'" class="text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              :class="group.labelClass || 'text-(--ui-text-dimmed)'">
              <UIcon v-if="group.icon" :name="group.icon" class="size-3.5 mr-1 align-[-2px]" />
              {{ group.label }}
              <span class="text-(--ui-text-dimmed) font-mono normal-case ml-1">({{ group.ids.length }})</span>
            </p>
            <div class="space-y-1.5">
              <InlineTask v-for="id in group.ids" :key="id" :task-id="id"
                :initial-data="taskCache[id]"
                @update:completed="onTaskStatus" />
            </div>
          </div>
        </template>
        <p v-else-if="!allTaskIds.length" class="text-sm text-(--ui-text-dimmed) italic">No tasks for this day. Tap + Task to add one.</p>
        <p v-else class="text-sm text-(--ui-text-dimmed) italic">All tasks done for this day.</p>
      </div>

      <!-- Done section (collapsed by default) -->
      <div v-if="doneTaskIds.length">
        <button @click="doneOpen = !doneOpen"
          class="w-full flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-2 py-1">
          <UIcon :name="doneOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
          <span>Done</span>
          <span class="text-(--ui-text-dimmed) font-mono normal-case">({{ doneTaskIds.length }})</span>
        </button>
        <div v-if="doneOpen" class="space-y-1.5">
          <InlineTask v-for="id in sortedDoneTaskIds" :key="id" :task-id="id"
            :initial-data="taskCache[id]"
            @update:completed="onTaskStatus" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked';
import { parseChecklist, hasChecklist, replaceChecklistWithMentions } from '~/composables/useChecklist';
import { parseHashtags } from '~/composables/useHashtagParse';
import { todayLocal, localDateOffset, parseUTC } from '~/composables/useDate';
import { PRIORITY_OPTIONS } from '~/composables/usePriority';
import type { Task } from '~/composables/useNotes';

interface DiaryEntry {
  id: string;
  workspace_id: string | null;
  entry_date: string;
  content: string;
  links?: any[];
}

const { activeId } = useWorkspace();
const { createTask } = useTasks();

const selectedDate = ref(todayLocal());
const showAddTask = ref(false);
const entry = ref<DiaryEntry | null>(null);
const editContent = ref('');
const loading = ref(false);
const saving = ref(false);
const editMode = ref(false);
const carriedTasks = ref<{ id: string; title: string }[]>([]);
const entryDates = ref<Set<string>>(new Set());

const mentionOpen = ref(false);
const mentionResults = ref<any[]>([]);
const contentRef = ref<HTMLTextAreaElement>();
const creatingTasks = ref(false);
const doneOpen = ref(false);
const taskCompleted = ref<Record<string, boolean>>({});
const taskCache = ref<Record<string, Task & { subtasks?: Task[] }>>({});
const taskSort = ref<'created' | 'priority'>('created');
const taskGroup = ref<'none' | 'created' | 'priority'>('none');

function onTaskStatus(payload: { id: string; completed: boolean }) {
  taskCompleted.value = { ...taskCompleted.value, [payload.id]: payload.completed };
}

// Day navigation
const days = computed(() => {
  const r: any[] = [];
  const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const td = todayLocal();
  for (let i = -3; i <= 3; i++) {
    const ds = localDateOffset(i);
    const d = new Date(ds + 'T12:00:00');
    r.push({ date: ds, dayName: dn[d.getDay()], dayNum: d.getDate(), isToday: ds === td, hasContent: entryDates.value.has(ds) });
  }
  return r;
});

const selectedDayLabel = computed(() => {
  const td = todayLocal();
  if (selectedDate.value === td) return 'Today';
  if (selectedDate.value === localDateOffset(-1)) return 'Yesterday';
  if (selectedDate.value === localDateOffset(1)) return 'Tomorrow';
  return new Date(selectedDate.value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
});

// Aggregate all task IDs relevant to this day: carried + linked + mentioned
const allTaskIds = computed(() => {
  const ids = new Set<string>();
  for (const ct of carriedTasks.value) ids.add(ct.id);
  const taskLinks = entry.value?.links?.filter((l: any) => l.target_type === 'task') || [];
  for (const l of taskLinks) ids.add(l.target_id);
  const mentionRe = /@\[([^\]]+)\]/g;
  let m;
  while ((m = mentionRe.exec(editContent.value || '')) !== null) {
    const ref = m[1];
    const linked = taskLinks.find((l: any) => l.target_title === ref || l.target_id === ref);
    if (linked) ids.add(linked.target_id);
  }
  return [...ids];
});

const pendingTaskIds = computed(() => allTaskIds.value.filter(id => !taskCompleted.value[id]));
const doneTaskIds = computed(() => allTaskIds.value.filter(id => taskCompleted.value[id]));

// Fetch task metadata for sorting/grouping (dedupes + parallelizes)
watch(allTaskIds, async (ids) => {
  const missing = ids.filter(id => !taskCache.value[id]);
  if (!missing.length) return;
  const results = await Promise.all(
    missing.map(id => $fetch<Task & { subtasks: Task[] }>(`/api/tasks/${id}`).catch(() => null))
  );
  const next = { ...taskCache.value };
  results.forEach((r, i) => { if (r) next[missing[i]] = r; });
  taskCache.value = next;
}, { immediate: true });

function sortIds(ids: string[]): string[] {
  const cache = taskCache.value;
  const arr = [...ids];
  if (taskSort.value === 'priority') {
    arr.sort((a, b) => {
      const pa = cache[a]?.priority ?? 0;
      const pb = cache[b]?.priority ?? 0;
      if (pa !== pb) return pb - pa;
      const ta = cache[a]?.created_at ? parseUTC(cache[a]!.created_at).getTime() : 0;
      const tb = cache[b]?.created_at ? parseUTC(cache[b]!.created_at).getTime() : 0;
      return tb - ta;
    });
  } else {
    arr.sort((a, b) => {
      const ta = cache[a]?.created_at ? parseUTC(cache[a]!.created_at).getTime() : 0;
      const tb = cache[b]?.created_at ? parseUTC(cache[b]!.created_at).getTime() : 0;
      return tb - ta;
    });
  }
  return arr;
}

const sortedPendingTaskIds = computed(() => sortIds(pendingTaskIds.value));
const sortedDoneTaskIds = computed(() => sortIds(doneTaskIds.value));

interface TaskGroup { key: string; label: string; ids: string[]; icon?: string; labelClass?: string; }

const pendingGroups = computed<TaskGroup[]>(() => {
  const ids = sortedPendingTaskIds.value;
  if (!ids.length) return [];
  if (taskGroup.value === 'none') {
    return [{ key: 'all', label: '', ids }];
  }
  if (taskGroup.value === 'priority') {
    const groups = new Map<number, string[]>();
    for (const id of ids) {
      const p = taskCache.value[id]?.priority ?? 0;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p)!.push(id);
    }
    const out: TaskGroup[] = [];
    for (const opt of PRIORITY_OPTIONS) {
      const list = groups.get(opt.value);
      if (list?.length) out.push({ key: `p${opt.value}`, label: opt.label, ids: list, icon: opt.icon, labelClass: opt.textClass });
    }
    const none = groups.get(0);
    if (none?.length) out.push({ key: 'p0', label: 'No priority', ids: none, icon: 'i-lucide-minus' });
    return out;
  }
  // group by created date
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const ca = taskCache.value[id]?.created_at;
    const key = ca ? String(ca).slice(0, 10) : 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(id);
  }
  const today = todayLocal();
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => {
      let label = key;
      if (key === today) label = 'Today';
      else if (key === localDateOffset(-1)) label = 'Yesterday';
      else if (key !== 'unknown') {
        const d = new Date(key + 'T12:00:00');
        label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      } else {
        label = 'Unknown';
      }
      return { key, label, ids: list, icon: 'i-lucide-calendar' };
    });
});

// Notes body: markdown of content with @[...] mentions stripped (tasks shown in Tasks section)
const notesHtml = computed(() => {
  if (!editContent.value) return '';
  const cleaned = editContent.value
    .replace(/@\[[^\]]+\]/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned) return '';
  return marked.parse(cleaned) as string;
});

async function selectDay(date: string) {
  selectedDate.value = date;
  await fetchEntry();
}

async function fetchEntry() {
  loading.value = true;
  carriedTasks.value = [];
  try {
    const q: Record<string, string> = {};
    if (activeId.value) q.workspace_id = activeId.value;

    // Try to get existing entry
    const data = await $fetch<DiaryEntry>(`/api/diary/${selectedDate.value}`, { query: q }).catch(() => null);
    if (data) {
      entry.value = data;
      editContent.value = data.content;
      editMode.value = false;
      return;
    }

    // Create new entry (triggers carry-forward) — POST now returns links
    const created = await $fetch<DiaryEntry & { carried_tasks?: { id: string; title: string }[] }>('/api/diary', {
      method: 'POST',
      body: { entry_date: selectedDate.value, workspace_id: activeId.value },
    });
    entry.value = created;
    editContent.value = created.content;
    carriedTasks.value = created.carried_tasks || [];
    editMode.value = false;
  } finally {
    loading.value = false;
  }
}

// Track which dates have content (batch endpoint)
async function fetchDateIndicators() {
  try {
    const fromDate = localDateOffset(-3);
    const toDate = localDateOffset(3);
    const q: Record<string, string> = { from: fromDate, to: toDate };
    if (activeId.value) q.workspace_id = activeId.value;
    const dates = await $fetch<string[]>('/api/diary/dates', { query: q });
    entryDates.value = new Set(dates);
  } catch {}
}

onMounted(async () => {
  await fetchEntry();
  fetchDateIndicators();
});
watch(activeId, () => fetchEntry());

// Autosave
let saveTimer: ReturnType<typeof setTimeout>;
function saveContent() {
  if (!entry.value) return;
  clearTimeout(saveTimer);
  saving.value = true;
  saveTimer = setTimeout(async () => {
    const q: Record<string, string> = {};
    if (activeId.value) q.workspace_id = activeId.value;
    await $fetch(`/api/diary/${selectedDate.value}`, {
      method: 'PUT',
      body: { content: editContent.value, workspace_id: activeId.value },
    });
    if (editContent.value.trim()) entryDates.value.add(selectedDate.value);
    saving.value = false;
  }, 300);
}

// Debounced mention search
let mentionTimer: ReturnType<typeof setTimeout>;
function debouncedSearchMentions(q: string) {
  clearTimeout(mentionTimer);
  mentionTimer = setTimeout(() => searchMentions(q), 200);
}

function handleContentInput() {
  saveContent();
  const el = contentRef.value; if (!el) return;
  const pos = el.selectionStart; const text = editContent.value.substring(0, pos); const at = text.lastIndexOf('@');
  if (at >= 0 && (at === 0 || text[at - 1] === ' ' || text[at - 1] === '\n')) {
    const q = text.substring(at + 1);
    if (q.length > 0 && !q.includes(' ') && !q.includes('\n')) {
      mentionOpen.value = true; debouncedSearchMentions(q); return;
    }
  }
  mentionOpen.value = false;
}

async function toggleEditMode() {
  if (editMode.value && hasChecklist(editContent.value) && entry.value) {
    // Switching to view mode — auto-convert checklists to tasks
    creatingTasks.value = true;
    try {
      const items = parseChecklist(editContent.value);
      if (items.length) {
        // Apply hashtag parsing recursively to every checklist item
        const applyParse = (it: any): any => {
          const p = parseHashtags(it.title);
          return {
            title: p.title,
            checked: it.checked,
            tags: p.tags,
            priority: p.priority,
            status: p.status,
            due_at: p.due_at ? new Date(p.due_at).toISOString() : undefined,
            children: (it.children || []).map(applyParse),
          };
        };
        const parsedItems = items.map(applyParse);

        await $fetch<any[]>('/api/tasks/from-checklist', {
          method: 'POST',
          body: {
            items: parsedItems,
            source_type: 'diary',
            source_id: entry.value.id,
            workspace_id: activeId.value,
            due_date: selectedDate.value,
          },
        });

        const rootPairs = items.map((orig, idx) => ({ original: orig.title.trim(), clean: parsedItems[idx].title }));
        editContent.value = replaceChecklistWithMentions(editContent.value, rootPairs);
        saveContent();

        // Reload entry to get updated links
        const q: Record<string, string> = {};
        if (activeId.value) q.workspace_id = activeId.value;
        const full = await $fetch<DiaryEntry>(`/api/diary/${selectedDate.value}`, { query: q }).catch(() => null);
        if (full) entry.value = full;
      }
    } finally {
      creatingTasks.value = false;
    }
  }
  editMode.value = !editMode.value;
}

async function handleAddTask(data: { title: string; due_at?: string; subtasks?: string[]; tags?: string[]; priority?: number; status?: string }) {
  const dueAt = data.due_at || new Date(`${selectedDate.value}T09:00`).toISOString();
  const task = await createTask({ title: data.title, due_at: dueAt, tags: data.tags, workspace_id: activeId.value, priority: data.priority, status: data.status });
  if (data.subtasks?.length) {
    for (const sub of data.subtasks) await createTask({ title: sub, parent_id: task.id, workspace_id: activeId.value });
  }
  const mention = `@[${task.title}]`;
  editContent.value = editContent.value?.trim() ? `${editContent.value}\n${mention}` : mention;
  if (entry.value) {
    await $fetch('/api/links', { method: 'POST', body: { source_type: 'diary', source_id: entry.value.id, target_type: 'task', target_id: task.id } }).catch(() => {});
    const newLink = { link_id: '', target_type: 'task', target_id: task.id, target_title: task.title };
    entry.value.links = [...(entry.value.links || []), newLink];
  }
  entryDates.value.add(selectedDate.value);
  saveContent();
  showAddTask.value = false;
}

async function searchMentions(q: string) { mentionResults.value = await $fetch<any[]>('/api/mention', { query: { q } }); }

async function insertMention(item: { id: string; type: string; title: string }) {
  const el = contentRef.value; if (!el) return;
  const pos = el.selectionStart; const text = editContent.value; const at = text.lastIndexOf('@', pos - 1);
  editContent.value = text.substring(0, at) + `@[${item.title}]` + text.substring(pos);
  mentionOpen.value = false;
  if (entry.value) {
    await $fetch('/api/links', { method: 'POST', body: { source_type: 'diary', source_id: entry.value.id, target_type: item.type, target_id: item.id } });
    // Optimistically add link to local state
    const newLink = { link_id: '', target_type: item.type, target_id: item.id, target_title: item.title };
    if (entry.value.links) {
      entry.value.links.push(newLink);
    } else {
      entry.value.links = [newLink];
    }
  }
  saveContent();
}
</script>
