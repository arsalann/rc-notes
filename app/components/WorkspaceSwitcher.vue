<template>
  <div class="relative">
    <button @click="open = !open" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-medium btn-tap" style="background-color:#3f3f46">
      <span v-if="active">{{ active.emoji }} {{ active.name }}</span>
      <span v-else class="text-muted">All</span>
      <svg class="w-3.5 h-3.5 text-faint transition-transform" :class="open && 'rotate-180'" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>
    </button>
    <div v-if="open" class="fixed inset-0 z-40" @click="open = false" />
    <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0 -translate-y-1">
      <div v-if="open" class="absolute left-0 top-full mt-2 surface-overlay rounded-2xl shadow-xl py-2 z-50 min-w-[200px]">
        <button @click="select(null)" class="w-full px-4 py-2.5 text-left text-[14px] flex items-center gap-2.5" :class="!activeId && 'font-semibold accent-text'">All Workspaces</button>
        <div class="divider my-1.5 mx-3" />
        <button v-for="ws in workspaces" :key="ws.id" @click="select(ws.id)" class="w-full px-4 py-2.5 text-left text-[14px] flex items-center gap-2.5" :class="activeId === ws.id && 'font-semibold accent-text'">
          <span class="text-lg">{{ ws.emoji }}</span><span>{{ ws.name }}</span>
        </button>
        <div class="divider my-1.5 mx-3" />
        <button @click="showCreate = true; open = false" class="w-full px-4 py-2.5 text-left text-[14px] text-muted flex items-center gap-2.5">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>New workspace
        </button>
      </div>
    </Transition>
    <Transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="showCreate" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style="background:rgba(0,0,0,0.5)" @click.self="showCreate = false">
        <form @submit.prevent="handleCreate" class="surface-overlay rounded-2xl p-5 w-full max-w-sm shadow-2xl">
          <h3 class="text-lg font-bold mb-4">New Workspace</h3>
          <div class="flex gap-3">
            <input v-model="newEmoji" placeholder="📁" class="w-14 text-center rounded-xl py-3 text-xl outline-none" style="background-color:#3f3f46" maxlength="2" />
            <input v-model="newName" placeholder="Workspace name" class="flex-1 rounded-xl px-4 py-3 text-[15px] outline-none" style="background-color:#3f3f46" autofocus />
          </div>
          <div class="flex gap-3 mt-5">
            <button type="button" @click="showCreate = false" class="btn-secondary flex-1">Cancel</button>
            <button type="submit" :disabled="!newName.trim()" class="btn-primary flex-1">Create</button>
          </div>
        </form>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
const { workspaces, active, activeId, setActive, createWorkspace } = useWorkspace();
const open = ref(false); const showCreate = ref(false); const newName = ref(''); const newEmoji = ref('');
function select(id: string | null) { setActive(id); open.value = false; }
async function handleCreate() { if(!newName.value.trim())return; const ws=await createWorkspace({name:newName.value.trim(),emoji:newEmoji.value.trim()||'📁'}); setActive(ws.id); showCreate.value=false; newName.value=''; newEmoji.value=''; }
</script>
