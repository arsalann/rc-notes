<template>
  <div class="max-w-lg mx-auto">
    <div class="px-4 pt-5 safe-top">
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-faint" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>
        <input ref="searchInput" :value="query" @input="search(($event.target as HTMLInputElement).value)"
          placeholder="Search tasks and notes..." class="w-full pl-10 pr-4 py-3 surface-input rounded-xl outline-none text-base"/>
        <button v-if="query" @click="search('');query=''" class="absolute right-3 top-1/2 -translate-y-1/2 text-faint"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></button>
      </div>
    </div>
    <div v-if="searching" class="px-4 mt-6 space-y-3"><div v-for="i in 3" :key="i" class="h-14 rounded-2xl animate-pulse" style="background-color:#27272a"/></div>
    <div v-else-if="results.length" class="px-4 mt-4 space-y-3 pb-6">
      <template v-for="item in results" :key="item.id">
        <TaskItem v-if="item.type==='task'" :task="item" @toggle="handleToggle"/>
        <NuxtLink v-else :to="`/notes/${item.id}`" class="block p-4 surface-card rounded-2xl btn-tap">
          <div class="flex items-center gap-2"><span class="badge-note">Note</span><span class="text-[14px] font-medium truncate">{{ item.title }}</span></div>
          <p v-if="item.detail" class="text-[13px] text-muted mt-1 line-clamp-1">{{ item.detail }}</p>
        </NuxtLink>
      </template>
    </div>
    <EmptyState v-else-if="query" message="No results found." icon="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
    <EmptyState v-else message="Search tasks and notes." icon="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
  </div>
</template>

<script setup lang="ts">
const {toggleComplete}=useTasks(); const {activeId}=useWorkspace();
const query=ref(''); const results=ref<any[]>([]); const searching=ref(false); const searchInput=ref<HTMLInputElement>(); let dt:ReturnType<typeof setTimeout>;
onMounted(()=>searchInput.value?.focus());
function search(q:string){query.value=q;clearTimeout(dt);if(!q.trim()){results.value=[];return;}
  dt=setTimeout(async()=>{searching.value=true;try{const p:Record<string,string>={q};if(activeId.value)p.workspace_id=activeId.value;results.value=await $fetch<any[]>('/api/search',{query:p});}finally{searching.value=false;}},300);}
async function handleToggle(id:string){await toggleComplete(id);if(query.value)search(query.value);}
</script>
