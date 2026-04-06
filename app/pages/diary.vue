<template>
  <div class="max-w-lg mx-auto min-h-screen">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg px-4 pt-5 pb-3 safe-top">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold tracking-tight">Diary</h1>
        <WorkspaceSwitcher />
      </div>
    </div>

    <!-- Day selector -->
    <div class="flex gap-2 px-4 mt-3 no-scrollbar overflow-x-auto">
      <button v-for="day in days" :key="day.date" @click="selectDay(day.date)"
        class="flex flex-col items-center flex-1 min-w-16 px-2 py-3 rounded-2xl transition-all duration-200 active:scale-95"
        :class="selectedDate === day.date
          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
          : day.isToday
            ? 'bg-(--ui-bg-elevated) ring-1 ring-(--ui-primary)/40'
            : 'bg-(--ui-bg-elevated) ring-1 ring-(--ui-border)'">
        <span class="text-[11px] uppercase font-semibold tracking-wide"
          :class="selectedDate === day.date ? 'text-white/70' : 'text-(--ui-text-dimmed)'">{{ day.dayName }}</span>
        <span class="text-xl font-bold mt-1">{{ day.dayNum }}</span>
        <div v-if="day.hasContent" class="w-1.5 h-1.5 rounded-full mt-1.5"
          :class="selectedDate === day.date ? 'bg-white/60' : 'bg-(--ui-primary)'" />
      </button>
    </div>

    <!-- Day label + edit toggle -->
    <div class="px-4 mt-5 flex items-center justify-between">
      <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed)">{{ selectedDayLabel }}</p>
      <UButton :color="editMode ? 'primary' : 'neutral'" :variant="editMode ? 'soft' : 'ghost'" size="xs"
        :icon="editMode ? 'i-lucide-eye' : 'i-lucide-pencil'" @click="editMode = !editMode" />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-4 mt-4">
      <USkeleton class="h-40 w-full" />
    </div>

    <div v-else class="px-4 mt-3 pb-8">
      <!-- Carried forward items -->
      <div v-if="carriedTasks.length && !entry?.content?.trim()" class="mb-4">
        <p class="text-xs font-medium text-(--ui-text-dimmed) mb-2">
          <UIcon name="i-lucide-arrow-right-from-line" class="size-3 inline mr-1" />
          Carried from previous day
        </p>
        <div class="space-y-1.5">
          <InlineTask v-for="ct in carriedTasks" :key="ct.id" :task-id="ct.id" />
        </div>
      </div>

      <!-- Create tasks from checklist -->
      <Transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0 translate-y-1" enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0 translate-y-1">
        <div v-if="editMode && checklistDetected" class="flex items-center gap-2 px-3 py-2.5 mb-3 rounded-xl bg-(--ui-bg-elevated) ring-1 ring-(--ui-border)">
          <UIcon name="i-lucide-list-checks" class="size-4 text-(--ui-primary) shrink-0" />
          <span class="text-xs text-(--ui-text-muted) flex-1">Checklist detected ({{ checklistCount }} item{{ checklistCount > 1 ? 's' : '' }})</span>
          <UButton size="xs" color="primary" variant="soft" :loading="creatingTasks" @click="convertChecklistToTasks">
            Create tasks
          </UButton>
        </div>
      </Transition>

      <!-- Edit mode -->
      <div v-if="editMode" class="relative">
        <Transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
          leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
          <div v-if="saving" class="absolute top-2 right-2 flex items-center gap-1.5 text-xs text-(--ui-text-dimmed)">
            <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" /> Saving
          </div>
        </Transition>
        <textarea v-model="editContent" @input="handleContentInput" @blur="saveContent" @keydown.escape="mentionOpen = false" ref="contentRef"
          class="w-full text-sm leading-7 bg-transparent outline-none resize-none text-(--ui-text-muted) min-h-[250px] placeholder:text-(--ui-text-dimmed) font-mono"
          placeholder="Write about your day... Type @ to link a task or note" />
        <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0 -translate-y-1">
          <UCard v-if="mentionOpen && mentionResults.length" class="absolute left-0 right-0 z-50 max-h-48 overflow-y-auto" :ui="{ body: 'sm:p-1' }" style="top:0">
            <button v-for="item in mentionResults" :key="item.id" @mousedown.prevent="insertMention(item)"
              class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 rounded-md transition-colors hover:bg-(--ui-bg-elevated)">
              <UBadge :color="item.type === 'task' ? 'primary' : 'neutral'" variant="subtle" size="xs">{{ item.type === 'task' ? 'Task' : 'Note' }}</UBadge>
              <span class="truncate">{{ item.title }}</span>
              <span class="text-xs text-(--ui-text-dimmed) font-mono ml-auto">{{ item.display_id }}</span>
            </button>
          </UCard>
        </Transition>
      </div>

      <!-- Preview mode -->
      <div v-else>
        <template v-for="(block, i) in renderedBlocks" :key="i">
          <InlineTask v-if="block.type === 'task'" :task-id="block.taskId" />
          <div v-else class="prose prose-invert prose-sm max-w-none
            prose-headings:text-(--ui-text) prose-p:text-(--ui-text-muted) prose-p:leading-7
            prose-a:text-(--ui-primary) prose-strong:text-(--ui-text)
            prose-code:text-(--ui-primary) prose-code:bg-(--ui-bg-elevated) prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-(--ui-bg-elevated) prose-pre:border prose-pre:border-(--ui-border)
            prose-li:text-(--ui-text-muted) prose-blockquote:border-(--ui-border) prose-blockquote:text-(--ui-text-dimmed)
            prose-hr:border-(--ui-border)"
            v-html="block.html" />
        </template>
        <p v-if="!editContent?.trim() && !carriedTasks.length" class="text-sm text-(--ui-text-dimmed) italic">
          Nothing written yet. Tap the pencil to start writing.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked';
import { parseChecklist, hasChecklist, replaceChecklistWithMentions } from '~/composables/useChecklist';

interface DiaryEntry {
  id: string;
  workspace_id: string | null;
  entry_date: string;
  content: string;
  links?: any[];
}

const { activeId } = useWorkspace();

const selectedDate = ref(new Date().toISOString().split('T')[0]);
const entry = ref<DiaryEntry | null>(null);
const editContent = ref('');
const loading = ref(false);
const saving = ref(false);
const editMode = ref(true);
const carriedTasks = ref<{ id: string; title: string }[]>([]);
const entryDates = ref<Set<string>>(new Set());

const mentionOpen = ref(false);
const mentionResults = ref<any[]>([]);
const contentRef = ref<HTMLTextAreaElement>();
const creatingTasks = ref(false);

const checklistDetected = computed(() => hasChecklist(editContent.value));
const checklistCount = computed(() => parseChecklist(editContent.value).length);

// Day navigation
const days = computed(() => {
  const r: any[] = [];
  const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const td = new Date().toISOString().split('T')[0];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    r.push({ date: ds, dayName: dn[d.getDay()], dayNum: d.getDate(), isToday: ds === td, hasContent: entryDates.value.has(ds) });
  }
  return r;
});

const selectedDayLabel = computed(() => {
  const td = new Date().toISOString().split('T')[0];
  if (selectedDate.value === td) return 'Today';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (selectedDate.value === y.toISOString().split('T')[0]) return 'Yesterday';
  const t = new Date(); t.setDate(t.getDate() + 1);
  if (selectedDate.value === t.toISOString().split('T')[0]) return 'Tomorrow';
  return new Date(selectedDate.value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
});

// Rendered blocks (markdown + inline tasks)
const renderedBlocks = computed(() => {
  if (!editContent.value) return [];
  const blocks: { type: 'html' | 'task'; html?: string; taskId?: string }[] = [];
  const regex = /@\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;
  const content = editContent.value;

  while ((match = regex.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index);
    if (before.trim()) blocks.push({ type: 'html', html: marked.parse(before) as string });
    const ref = match[1];
    const linkedTask = entry.value?.links?.find(
      l => l.target_type === 'task' && (l.target_title === ref || l.target_id === ref)
    );
    if (linkedTask) {
      blocks.push({ type: 'task', taskId: linkedTask.target_id });
    } else if (ref.startsWith('T') || ref.match(/^[a-z]{5}\d{3}/)) {
      blocks.push({ type: 'task', taskId: ref });
    } else {
      blocks.push({ type: 'html', html: marked.parse(`@[${ref}]`) as string });
    }
    lastIndex = match.index + match[0].length;
  }

  const remaining = content.slice(lastIndex);
  if (remaining.trim()) blocks.push({ type: 'html', html: marked.parse(remaining) as string });
  return blocks;
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
      editMode.value = !data.content?.trim();
      return;
    }

    // Create new entry (triggers carry-forward)
    const created = await $fetch<DiaryEntry & { carried_tasks?: { id: string; title: string }[] }>('/api/diary', {
      method: 'POST',
      body: { entry_date: selectedDate.value, workspace_id: activeId.value },
    });
    entry.value = created;
    editContent.value = created.content;
    carriedTasks.value = created.carried_tasks || [];
    editMode.value = true;

    // Reload entry to get links
    const full = await $fetch<DiaryEntry>(`/api/diary/${selectedDate.value}`, { query: q }).catch(() => null);
    if (full) entry.value = full;
  } finally {
    loading.value = false;
  }
}

// Track which dates have content (for dot indicators)
async function fetchDateIndicators() {
  try {
    const q: Record<string, string> = {};
    if (activeId.value) q.workspace_id = activeId.value;
    // Simple approach: check last 7 days
    const from = new Date(); from.setDate(from.getDate() - 3);
    const to = new Date(); to.setDate(to.getDate() + 3);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      try {
        const e = await $fetch<DiaryEntry>(`/api/diary/${ds}`, { query: q });
        if (e?.content?.trim()) entryDates.value.add(ds);
      } catch {}
    }
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

function handleContentInput() {
  saveContent();
  const el = contentRef.value; if (!el) return;
  const pos = el.selectionStart; const text = editContent.value.substring(0, pos); const at = text.lastIndexOf('@');
  if (at >= 0 && (at === 0 || text[at - 1] === ' ' || text[at - 1] === '\n')) {
    const q = text.substring(at + 1);
    if (q.length > 0 && !q.includes(' ') && !q.includes('\n')) {
      mentionOpen.value = true; searchMentions(q); return;
    }
  }
  mentionOpen.value = false;
}

async function convertChecklistToTasks() {
  if (!entry.value) return;
  creatingTasks.value = true;
  try {
    const items = parseChecklist(editContent.value);
    if (!items.length) return;

    await $fetch<any[]>('/api/tasks/from-checklist', {
      method: 'POST',
      body: {
        items,
        source_type: 'diary',
        source_id: entry.value.id,
        workspace_id: activeId.value,
      },
    });

    // Replace checklist with @-mentions
    const rootTitles = items.map(i => i.title);
    editContent.value = replaceChecklistWithMentions(editContent.value, rootTitles);
    saveContent();

    // Reload entry to get updated links
    const q: Record<string, string> = {};
    if (activeId.value) q.workspace_id = activeId.value;
    const full = await $fetch<DiaryEntry>(`/api/diary/${selectedDate.value}`, { query: q }).catch(() => null);
    if (full) entry.value = full;
  } finally {
    creatingTasks.value = false;
  }
}

async function searchMentions(q: string) { mentionResults.value = await $fetch<any[]>('/api/mention', { query: { q } }); }

async function insertMention(item: { id: string; type: string; title: string }) {
  const el = contentRef.value; if (!el) return;
  const pos = el.selectionStart; const text = editContent.value; const at = text.lastIndexOf('@', pos - 1);
  editContent.value = text.substring(0, at) + `@[${item.title}]` + text.substring(pos);
  mentionOpen.value = false;
  if (entry.value) {
    await $fetch('/api/links', { method: 'POST', body: { source_type: 'diary', source_id: entry.value.id, target_type: item.type, target_id: item.id } });
    // Reload to get updated links
    const q: Record<string, string> = {};
    if (activeId.value) q.workspace_id = activeId.value;
    const full = await $fetch<DiaryEntry>(`/api/diary/${selectedDate.value}`, { query: q }).catch(() => null);
    if (full) entry.value = full;
  }
  saveContent();
}
</script>
