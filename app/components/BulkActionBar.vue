<template>
  <Transition
    enter-active-class="transition ease-out duration-150"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition ease-in duration-100"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0 translate-y-2">
    <div v-if="open" class="fixed left-0 right-0 z-40 px-4" style="bottom: calc(env(safe-area-inset-bottom, 0px) + 6.75rem)">
      <div class="calm-bulk-bar max-w-lg md:max-w-2xl mx-auto rounded-2xl px-3 py-2.5" role="toolbar" aria-label="Bulk actions">
        <div class="flex items-center gap-1.5">
          <span class="text-sm font-semibold text-(--ui-text) whitespace-nowrap pl-1.5 pr-1">{{ count }} selected</span>
          <UButton size="xs" color="neutral" variant="ghost" :disabled="!total" @click="emit('toggle-all')">
            {{ count === total && total ? 'None' : 'All' }}
          </UButton>
          <div class="flex-1" />
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Stop selecting" @click="emit('close')" />
        </div>
        <div class="grid grid-cols-4 gap-1.5 mt-1.5">
          <UDropdownMenu :items="statusItems" :ui="{ content: 'min-w-32' }">
            <button type="button" class="daybook-bulk-action" :disabled="!count || busy">
              <UIcon name="i-lucide-circle-dot" class="size-4" /><span>Mark as</span>
            </button>
          </UDropdownMenu>
          <UDropdownMenu :items="priorityItems" :ui="{ content: 'min-w-36' }">
            <button type="button" class="daybook-bulk-action" :disabled="!count || busy">
              <UIcon name="i-lucide-flame" class="size-4" /><span>Priority</span>
            </button>
          </UDropdownMenu>
          <button type="button" class="daybook-bulk-action" :disabled="!count || busy"
            :aria-label="archived ? 'Restore selected' : 'Archive selected'" @click="emit('archive')">
            <UIcon :name="archived ? 'i-lucide-archive-restore' : 'i-lucide-archive'" class="size-4" />
            <span>{{ archived ? 'Restore' : 'Archive' }}</span>
          </button>
          <button type="button" class="daybook-bulk-action is-danger" :disabled="!count || busy"
            aria-label="Delete selected" @click="confirmDelete = true">
            <UIcon name="i-lucide-trash-2" class="size-4" /><span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <UModal v-model:open="confirmDelete" :title="`Delete ${count} task${count === 1 ? '' : 's'}?`"
    description="The selected tasks and their subtasks are deleted everywhere, including the iOS app. Archive instead if you may want them back.">
    <template #footer>
      <div class="flex gap-3 w-full">
        <UButton color="neutral" variant="soft" class="flex-1" @click="confirmDelete = false">Cancel</UButton>
        <UButton color="error" class="flex-1" icon="i-lucide-trash-2" :loading="busy" @click="onDelete">Delete</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { PRIORITY_OPTIONS } from '~/composables/usePriority';

/** The multi-select toolbar shared by the Tasks and Today pages. Delete asks for confirmation first. */
const props = defineProps<{ open: boolean; count: number; total: number; busy?: boolean; archived?: boolean }>();
const emit = defineEmits<{
  'toggle-all': [];
  close: [];
  status: [value: 'next' | 'now' | 'done'];
  priority: [value: number];
  archive: [];
  delete: [];
}>();

const confirmDelete = ref(false);
watch(() => props.open, open => { if (!open) confirmDelete.value = false; });

function onDelete() {
  emit('delete');
  confirmDelete.value = false;
}

const statusItems = computed(() => [[
  { label: 'Next', icon: 'i-lucide-circle', onSelect: () => emit('status', 'next') },
  { label: 'Now', icon: 'i-lucide-circle-dot', onSelect: () => emit('status', 'now') },
  { label: 'Done', icon: 'i-lucide-circle-check', onSelect: () => emit('status', 'done') },
]]);

const priorityItems = computed(() => [[
  ...PRIORITY_OPTIONS.map(p => ({ label: p.label, icon: p.icon, onSelect: () => emit('priority', p.value) })),
  { label: 'None', icon: 'i-lucide-minus', onSelect: () => emit('priority', 0) },
]]);
</script>
