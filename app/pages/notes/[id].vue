<template>
  <div class="max-w-lg mx-auto min-h-screen">
    <div class="flex items-center justify-between px-4 py-3 safe-top">
      <button @click="navigateTo('/notes')" class="touch-target -ml-2 text-muted"><svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/></svg></button>
      <div class="flex items-center gap-0.5">
        <div v-if="saving" class="flex items-center gap-1 text-[12px] text-faint mr-2"><svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving</div>
        <button @click="handlePin" class="touch-target text-muted"><svg class="w-5 h-5" :fill="note?.pinned?'currentColor':'none'" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"/></svg></button>
        <button @click="confirmDelete=true" class="touch-target text-muted"><svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg></button>
      </div>
    </div>
    <div v-if="loadingNote" class="flex items-center justify-center py-20"><div class="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"/></div>
    <div v-else-if="note" class="px-4">
      <input v-model="editTitle" @blur="saveField('title',editTitle)" @keydown.enter="($event.target as HTMLInputElement).blur()" class="w-full text-xl font-bold bg-transparent outline-none" placeholder="Title"/>
      <div class="relative mt-3">
        <textarea v-model="editContent" @input="handleContentInput" @blur="saveField('content',editContent)" @keydown.escape="mentionOpen=false" ref="contentRef"
          class="w-full text-[15px] leading-relaxed bg-transparent outline-none resize-none text-muted min-h-[300px]" placeholder="Write something... Type @ to link a task or note"/>
        <div v-if="mentionOpen && mentionResults.length" class="absolute left-0 right-0 surface-overlay rounded-xl shadow-lg py-1 z-50 max-h-48 overflow-y-auto" style="top:0">
          <button v-for="item in mentionResults" :key="item.id" @mousedown.prevent="insertMention(item)" class="w-full px-3 py-2 text-left text-[14px] flex items-center gap-2">
            <span :class="item.type==='task'?'badge-task':'badge-note'">{{ item.type==='task'?'Task':'Note' }}</span>
            <span class="truncate">{{ item.title }}</span>
          </button>
        </div>
      </div>
      <div v-if="note.links?.length" class="mt-6">
        <p class="section-label mb-2">Linked</p>
        <div class="space-y-1">
          <NuxtLink v-for="link in note.links" :key="link.link_id" :to="link.target_type==='task'?`/tasks/${link.target_id}`:`/notes/${link.target_id}`"
            class="flex items-center gap-2 py-2 text-[14px] accent-text">
            <span :class="link.target_type==='task'?'badge-task':'badge-note'">{{ link.target_type==='task'?'Task':'Note' }}</span>{{ link.target_title }}
          </NuxtLink>
        </div>
      </div>
    </div>
    <Transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="confirmDelete" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style="background:rgba(0,0,0,0.5)" @click.self="confirmDelete=false">
        <div class="surface-overlay rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h3 class="text-lg font-bold">Delete note?</h3><p class="mt-2 text-[14px] text-muted">This can't be undone.</p>
          <div class="flex gap-3 mt-5"><button @click="confirmDelete=false" class="btn-secondary flex-1">Cancel</button><button @click="handleDelete" class="btn-danger flex-1">Delete</button></div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { Note } from '~/composables/useNotes';
const route=useRoute(); const id=route.params.id as string;
const {updateNote,deleteNote,togglePin}=useNotesCrud();
const note=ref<Note|null>(null); const loadingNote=ref(true); const saving=ref(false); const confirmDelete=ref(false);
const editTitle=ref(''); const editContent=ref(''); const contentRef=ref<HTMLTextAreaElement>();
const mentionOpen=ref(false); const mentionResults=ref<any[]>([]);
onMounted(async()=>{try{const d=await $fetch<Note>(`/api/notes/${id}`);note.value=d;editTitle.value=d.title;editContent.value=d.content;}finally{loadingNote.value=false;}});
let saveTimer:ReturnType<typeof setTimeout>;
function saveField(f:string,v:string){if(!note.value)return;clearTimeout(saveTimer);saving.value=true;saveTimer=setTimeout(async()=>{await updateNote(id,{[f]:v}as any);saving.value=false;},300);}
function handleContentInput(){saveField('content',editContent.value);const el=contentRef.value;if(!el)return;const pos=el.selectionStart;const text=editContent.value.substring(0,pos);const at=text.lastIndexOf('@');
  if(at>=0&&(at===0||text[at-1]===' '||text[at-1]==='\n')){const q=text.substring(at+1);if(q.length>0&&!q.includes(' ')&&!q.includes('\n')){mentionOpen.value=true;searchMentions(q);return;}}mentionOpen.value=false;}
async function searchMentions(q:string){mentionResults.value=await $fetch<any[]>('/api/mention',{query:{q}});}
async function insertMention(item:{id:string;type:string;title:string}){const el=contentRef.value;if(!el)return;const pos=el.selectionStart;const text=editContent.value;const at=text.lastIndexOf('@',pos-1);
  editContent.value=text.substring(0,at)+`@[${item.title}]`+text.substring(pos);mentionOpen.value=false;
  await $fetch('/api/links',{method:'POST',body:{source_type:'note',source_id:id,target_type:item.type,target_id:item.id}});
  note.value=await $fetch<Note>(`/api/notes/${id}`);saveField('content',editContent.value);}
async function handlePin(){if(!note.value)return;const u=await togglePin(id);note.value.pinned=u.pinned;}
async function handleDelete(){await deleteNote(id);navigateTo('/notes');}
</script>
