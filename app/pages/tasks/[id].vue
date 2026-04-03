<template>
  <div class="max-w-lg mx-auto min-h-screen">
    <div class="flex items-center justify-between px-4 py-3 safe-top">
      <button @click="navigateTo('/')" class="touch-target -ml-2 text-muted"><svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/></svg></button>
      <div class="flex items-center gap-0.5">
        <button @click="handlePin" class="touch-target text-muted"><svg class="w-5 h-5" :fill="task?.pinned?'currentColor':'none'" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"/></svg></button>
        <button @click="handleArchive" class="touch-target text-muted"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"/></svg></button>
        <button @click="confirmDelete=true" class="touch-target text-muted"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg></button>
      </div>
    </div>
    <div v-if="loadingTask" class="flex items-center justify-center py-20"><div class="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"/></div>
    <div v-else-if="task" class="px-4 pb-8">
      <div class="flex items-start gap-3">
        <button @click="handleToggleComplete" class="touch-target flex-shrink-0 -ml-2">
          <div class="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200" :class="task.completed?'checkbox-checked':'checkbox-unchecked'">
            <svg v-if="task.completed" class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
          </div>
        </button>
        <input v-model="editTitle" @blur="saveTitle" @keydown.enter="($event.target as HTMLInputElement).blur()" class="flex-1 text-xl font-bold bg-transparent outline-none" :class="task.completed&&'line-through text-muted'" placeholder="Task title"/>
      </div>
      <textarea v-model="editDescription" @blur="saveDescription" placeholder="Add details..." class="w-full mt-4 text-[15px] leading-relaxed bg-transparent outline-none resize-none text-muted min-h-[80px]"/>
      <div class="mt-5">
        <p class="section-label mb-2">Due Date</p>
        <div class="flex items-center gap-2 flex-wrap">
          <button v-for="opt in dateShortcuts" :key="opt.label" @click="saveDue(opt.value)" class="px-3 py-2 text-[13px] font-medium rounded-xl btn-tap transition-colors"
            :class="isDueMatch(opt.value)?'accent-bg text-white':'text-muted'" :style="!isDueMatch(opt.value)?'background-color:#3f3f46':''">{{ opt.label }}</button>
          <label class="px-3 py-2 text-[13px] font-medium rounded-xl text-muted btn-tap cursor-pointer" style="background-color:#3f3f46">Pick...<input type="datetime-local" :value="editDue" @change="saveDue(($event.target as HTMLInputElement).value)" class="sr-only"/></label>
          <button v-if="task.due_at" @click="saveDue('')" class="touch-target text-faint"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></button>
        </div>
      </div>
      <div class="mt-5">
        <p class="section-label mb-2">Tags</p>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span v-for="(tag,i) in editTags" :key="i" class="tag inline-flex items-center gap-1">{{ tag }}<button @click="removeTag(i)" class="opacity-50 hover:opacity-100 ml-0.5">&times;</button></span>
          <input v-model="newTag" @keydown.enter.prevent="addTag" @keydown.comma.prevent="addTag" placeholder="+ add tag" class="text-[13px] bg-transparent outline-none w-20 text-muted py-1"/>
        </div>
      </div>
      <div class="mt-6">
        <p class="section-label mb-3">Subtasks <span v-if="subtasks.length">({{ subtasksDone }}/{{ subtasks.length }})</span></p>
        <div class="space-y-1">
          <div v-for="sub in subtasks" :key="sub.id" class="group flex items-center gap-2.5 py-2 px-1 -mx-1 rounded-lg transition-colors" style="hover:background-color:#3f3f46">
            <button @click="toggleSubtask(sub.id)" class="touch-target flex-shrink-0 -ml-2">
              <div class="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200" :class="sub.completed?'checkbox-checked':'checkbox-unchecked'">
                <svg v-if="sub.completed" class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
              </div>
            </button>
            <span class="text-[14px] flex-1" :class="sub.completed&&'line-through text-muted'">{{ sub.title }}</span>
            <button @click="deleteSubtask(sub.id)" class="touch-target text-faint"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></button>
          </div>
        </div>
        <form @submit.prevent="addSubtask" class="flex items-center gap-2.5 mt-2 py-2 px-1 -mx-1">
          <div class="touch-target flex-shrink-0 -ml-2 flex items-center justify-center"><div class="w-5 h-5 rounded-full" style="border:2px dashed #71717a"/></div>
          <input v-model="newSubtask" placeholder="Add a subtask..." class="flex-1 text-[14px] bg-transparent outline-none text-muted"/>
          <button v-if="newSubtask.trim()" type="submit" class="text-[13px] font-semibold accent-text btn-tap px-2 py-1">Add</button>
        </form>
      </div>
    </div>
    <Transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="confirmDelete" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style="background:rgba(0,0,0,0.5)" @click.self="confirmDelete=false">
        <div class="surface-overlay rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h3 class="text-lg font-bold">Delete task?</h3><p class="mt-2 text-[14px] text-muted">This will also delete all subtasks.</p>
          <div class="flex gap-3 mt-5"><button @click="confirmDelete=false" class="btn-secondary flex-1">Cancel</button><button @click="handleDelete" class="btn-danger flex-1">Delete</button></div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { Task } from '~/composables/useNotes';
const route=useRoute(); const id=route.params.id as string;
const {updateTask,deleteTask,toggleComplete,togglePin,toggleArchive,createTask}=useTasks();
const task=ref<Task|null>(null); const subtasks=ref<Task[]>([]); const loadingTask=ref(true); const confirmDelete=ref(false);
const newSubtask=ref(''); const newTag=ref(''); const editTitle=ref(''); const editDescription=ref(''); const editTags=ref<string[]>([]); const editDue=ref('');
const subtasksDone=computed(()=>subtasks.value.filter(s=>s.completed).length);
const dateShortcuts=computed(()=>{const t=new Date();const tm=new Date(t);tm.setDate(tm.getDate()+1);const nw=new Date(t);nw.setDate(nw.getDate()+7);
  const f=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T09:00`;
  return [{label:'Today',value:f(t)},{label:'Tomorrow',value:f(tm)},{label:'Next week',value:f(nw)}];});
function isDueMatch(v:string){if(!task.value?.due_at)return false;return task.value.due_at.startsWith(v.split('T')[0]);}
onMounted(async()=>{try{const d=await $fetch<Task&{subtasks:Task[]}>(`/api/tasks/${id}`);task.value=d;subtasks.value=d.subtasks||[];editTitle.value=d.title;editDescription.value=d.description;editTags.value=[...(d.tags||[])];editDue.value=d.due_at?d.due_at.slice(0,16):'';}finally{loadingTask.value=false;}});
async function saveTitle(){if(!task.value||editTitle.value.trim()===task.value.title)return;task.value=await updateTask(id,{title:editTitle.value.trim()});}
async function saveDescription(){if(!task.value||editDescription.value===task.value.description)return;task.value=await updateTask(id,{description:editDescription.value});}
async function saveDue(v:string){task.value=await updateTask(id,{due_at:v?new Date(v).toISOString():null}as any);editDue.value=v;}
function addTag(){const t=newTag.value.replace(',','').trim();if(t&&!editTags.value.includes(t)){editTags.value.push(t);updateTask(id,{tags:editTags.value}as any);}newTag.value='';}
function removeTag(i:number){editTags.value.splice(i,1);updateTask(id,{tags:editTags.value}as any);}
async function handleToggleComplete(){const u=await toggleComplete(id);if(task.value)task.value.completed=u.completed;}
async function handlePin(){const u=await togglePin(id);if(task.value)task.value.pinned=u.pinned;}
async function handleArchive(){await toggleArchive(id);navigateTo('/');}
async function handleDelete(){await deleteTask(id);navigateTo('/');}
async function addSubtask(){const t=newSubtask.value.trim();if(!t)return;const s=await createTask({title:t,parent_id:id});subtasks.value.push(s);newSubtask.value='';}
async function toggleSubtask(sid:string){const u=await toggleComplete(sid);const i=subtasks.value.findIndex(s=>s.id===sid);if(i>=0)subtasks.value[i]={...subtasks.value[i],...u};}
async function deleteSubtask(sid:string){await deleteTask(sid);subtasks.value=subtasks.value.filter(s=>s.id!==sid);}
</script>
