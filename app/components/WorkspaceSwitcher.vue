<template>
  <UDropdownMenu :items="menuItems" :ui="{ content: 'min-w-52' }">
    <UButton color="neutral" variant="soft" size="sm" trailing-icon="i-lucide-chevron-down">
      <span v-if="active">{{ active.emoji }} {{ active.name }}</span>
      <span v-else>All</span>
    </UButton>
  </UDropdownMenu>

  <UModal v-model:open="showCreate" title="New Workspace">
    <template #body>
      <form @submit.prevent="handleCreate" class="space-y-4">
        <div class="flex gap-3">
          <UInput v-model="newEmoji" placeholder="📁" class="w-14 text-center" />
          <UInput v-model="newName" placeholder="Workspace name" class="flex-1" autofocus />
        </div>
      </form>
    </template>
    <template #footer>
      <div class="flex gap-3 w-full">
        <UButton color="neutral" variant="soft" class="flex-1" @click="showCreate = false">Cancel</UButton>
        <UButton color="primary" class="flex-1" :disabled="!newName.trim()" @click="handleCreate">Create</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const { workspaces, active, activeId, setActive, createWorkspace } = useWorkspace();
const showCreate = ref(false); const newName = ref(''); const newEmoji = ref('');

const menuItems = computed(() => {
  const groups: any[][] = [];

  groups.push([{
    label: 'All Workspaces',
    icon: 'i-lucide-layers',
    onSelect: () => setActive(null),
  }]);

  if (workspaces.value.length) {
    groups.push(
      workspaces.value.map(ws => ({
        label: `${ws.emoji} ${ws.name}`,
        onSelect: () => setActive(ws.id),
      }))
    );
  }

  groups.push([{
    label: 'New workspace',
    icon: 'i-lucide-plus',
    onSelect: () => { showCreate.value = true; },
  }]);

  return groups;
});

async function handleCreate() {
  if (!newName.value.trim()) return;
  const ws = await createWorkspace({ name: newName.value.trim(), emoji: newEmoji.value.trim() || '📁' });
  setActive(ws.id);
  showCreate.value = false;
  newName.value = '';
  newEmoji.value = '';
}
</script>
