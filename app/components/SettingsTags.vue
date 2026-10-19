<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-tags" class="size-5" />
        <span class="font-semibold">Tags</span>
      </div>
    </template>

    <div class="space-y-4">
      <p class="text-xs text-(--ui-text-muted)">
        Rename tags, give them an emoji, or archive ones you no longer use. Archived tags are hidden from the tag
        picker; tasks keep them.
      </p>
      <p v-if="!loaded" class="text-xs text-(--ui-text-dimmed)">Loading…</p>

      <div class="space-y-1.5">
        <div v-for="tag in activeTags" :key="tag.key"
          class="flex items-center gap-2 rounded-xl px-3 py-1.5 ring-1 ring-(--ui-border) bg-(--ui-bg-elevated)">
          <span class="w-6 text-center text-base leading-none" aria-hidden="true">{{ tag.emoji || '#' }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ tag.label }}</p>
            <p class="text-xs text-(--ui-text-dimmed) truncate">
              {{ usage(tag) }}<template v-if="tag.builtin"> · built-in</template>
            </p>
          </div>
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="`Edit ${tag.label}`" @click="openEdit(tag)" />
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-archive" :aria-label="`Archive ${tag.label}`"
            :loading="busyKey === tag.key" @click="setArchived(tag, true)" />
        </div>
        <p v-if="loaded && !activeTags.length" class="text-xs text-(--ui-text-dimmed) italic">No active tags.</p>
      </div>

      <div v-if="archivedTags.length" class="border-t border-(--ui-border) pt-3">
        <button type="button" class="w-full flex items-center gap-1.5 text-xs text-(--ui-text-dimmed) uppercase tracking-wider min-h-11"
          :aria-expanded="showArchived" @click="showArchived = !showArchived">
          <UIcon :name="showArchived ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
          Archived ({{ archivedTags.length }})
        </button>
        <div v-if="showArchived" class="space-y-1.5 mt-1">
          <div v-for="tag in archivedTags" :key="tag.key" class="flex items-center gap-2 rounded-xl px-3 py-1.5 ring-1 ring-(--ui-border)">
            <span class="w-6 text-center text-base leading-none opacity-70" aria-hidden="true">{{ tag.emoji || '#' }}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm truncate text-(--ui-text-muted)">{{ tag.label }}</p>
              <p class="text-xs text-(--ui-text-dimmed) truncate">{{ usage(tag) }}</p>
            </div>
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="`Edit ${tag.label}`" @click="openEdit(tag)" />
            <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-archive-restore" :loading="busyKey === tag.key"
              @click="setArchived(tag, false)">Restore</UButton>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="editOpen" :title="editing ? `Edit ${editing.label}` : 'Edit tag'">
      <template #body>
        <form v-if="editing" class="space-y-4" @submit.prevent="saveEdit">
          <div class="flex gap-2">
            <UFormField label="Emoji" class="w-20">
              <UInput v-model="form.emoji" placeholder="#" size="md" class="w-full" />
            </UFormField>
            <UFormField :label="editing.builtin ? 'Display name' : 'Name'" class="flex-1">
              <UInput v-model="form.name" size="md" class="w-full" />
            </UFormField>
          </div>

          <p v-if="editing.builtin" class="text-xs text-(--ui-text-muted)">
            Built-in tag: the name and emoji change how it is shown in this app; tasks are not rewritten and
            automatic detection keeps working.
          </p>

          <div v-if="renameWillOverwrite" class="daybook-warning rounded-xl px-3 py-2.5 text-sm" role="alert">
            <p class="font-semibold flex items-center gap-1.5">
              <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" /> This overwrites existing tasks
            </p>
            <p class="mt-1">
              Renaming rewrites the tag on <strong>{{ usage(editing) }}</strong>
              <template v-if="editing.variants.length > 1"> (every spelling: {{ editing.variants.join(', ') }})</template>.
              <template v-if="mergesInto"> “{{ mergesInto.label }}” already exists, so the two tags merge.</template>
              It can't be undone from the app.
            </p>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex gap-2 w-full">
          <UButton v-if="editing?.builtin && (editing.label_override || editing.emoji_override !== null)" color="neutral" variant="ghost"
            size="sm" :disabled="saving" @click="resetBuiltIn">Reset</UButton>
          <div class="flex-1" />
          <UButton color="neutral" variant="soft" @click="editOpen = false">Cancel</UButton>
          <UButton :color="renameWillOverwrite ? 'warning' : 'primary'" :loading="saving" :disabled="!form.name.trim() || !changed"
            @click="saveEdit">
            {{ renameWillOverwrite ? `Rename & overwrite` : 'Save' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UCard>
</template>

<script setup lang="ts">
import type { TagSummary } from '~/composables/useTagSettings';
import { manualTaskTagKey } from '~/utils/taskTags';

const { tags, loaded, fetchTags, updateTag, renameTag } = useTagSettings();
const toast = useToast();

onMounted(() => { fetchTags(); });

const activeTags = computed(() => tags.value.filter(t => !t.archived));
const archivedTags = computed(() => tags.value.filter(t => t.archived));
const showArchived = ref(false);
const busyKey = ref<string | null>(null);

function usage(tag: TagSummary): string {
  const parts = [`${tag.task_count} task${tag.task_count === 1 ? '' : 's'}`];
  if (tag.note_count) parts.push(`${tag.note_count} note${tag.note_count === 1 ? '' : 's'}`);
  return parts.join(', ');
}

async function setArchived(tag: TagSummary, archived: boolean) {
  busyKey.value = tag.key;
  try {
    await updateTag(tag.key, { archived });
    toast.add({ title: archived ? `“${tag.label}” archived` : `“${tag.label}” restored`, color: 'success' });
  } catch (err: any) {
    toast.add({ title: 'Tag not updated', description: err?.data?.statusMessage || 'Try again.', color: 'error' });
  } finally {
    busyKey.value = null;
  }
}

// --- Edit ---
const editOpen = ref(false);
const editing = ref<TagSummary | null>(null);
const form = reactive({ name: '', emoji: '' });
const saving = ref(false);

function openEdit(tag: TagSummary) {
  editing.value = tag;
  form.name = tag.label;
  form.emoji = tag.emoji || '';
  editOpen.value = true;
}

const nameChanged = computed(() => !!editing.value && form.name.trim() !== editing.value.label);
const emojiChanged = computed(() => !!editing.value && form.emoji.trim() !== (editing.value.emoji || ''));
const changed = computed(() => nameChanged.value || emojiChanged.value);
/** Renaming a custom tag that is in use rewrites tasks/notes; built-in tags only change their label. */
const renameWillOverwrite = computed(() =>
  !!editing.value && !editing.value.builtin && nameChanged.value && editing.value.task_count + editing.value.note_count > 0,
);
const mergesInto = computed(() => {
  if (!editing.value || !renameWillOverwrite.value) return null;
  const key = manualTaskTagKey(form.name);
  return key && key !== editing.value.key ? tags.value.find(t => t.key === key) ?? null : null;
});

async function saveEdit() {
  const tag = editing.value;
  if (!tag || !form.name.trim() || !changed.value || saving.value) return;
  saving.value = true;
  try {
    let key = tag.key;
    if (tag.builtin) {
      await updateTag(key, {
        ...(nameChanged.value ? { label: form.name.trim() === tag.name ? '' : form.name.trim() } : {}),
        ...(emojiChanged.value ? { emoji: form.emoji.trim() } : {}),
      });
      toast.add({ title: 'Tag updated', color: 'success' });
    } else {
      if (nameChanged.value) {
        const result = await renameTag(key, form.name.trim());
        key = result.key;
        toast.add({
          title: `Renamed to “${result.to}”`,
          description: `Updated ${result.tasks} task${result.tasks === 1 ? '' : 's'}${result.notes ? ` and ${result.notes} note${result.notes === 1 ? '' : 's'}` : ''}.`,
          color: 'success',
        });
      }
      if (emojiChanged.value) {
        await updateTag(key, { emoji: form.emoji.trim() || null });
        if (!nameChanged.value) toast.add({ title: 'Tag updated', color: 'success' });
      }
    }
    editOpen.value = false;
  } catch (err: any) {
    toast.add({ title: 'Tag not updated', description: err?.data?.statusMessage || 'Try again.', color: 'error' });
  } finally {
    saving.value = false;
  }
}

async function resetBuiltIn() {
  const tag = editing.value;
  if (!tag) return;
  saving.value = true;
  try {
    await updateTag(tag.key, { label: '', emoji: null });
    editOpen.value = false;
    toast.add({ title: `“${tag.name}” reset`, color: 'success' });
  } finally {
    saving.value = false;
  }
}
</script>
