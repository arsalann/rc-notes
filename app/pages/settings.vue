<template>
  <div class="max-w-lg mx-auto">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg px-4 pt-5 pb-3 safe-top">
      <h1 class="text-2xl font-bold tracking-tight">Settings</h1>
    </div>

    <div class="px-4 mt-4 space-y-6 pb-36">
      <!-- User info -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-user" class="size-5" />
            <span class="font-semibold">Account</span>
          </div>
        </template>
        <div class="space-y-3">
          <div>
            <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider">Username</p>
            <p class="text-sm font-medium mt-0.5">{{ username || 'Not set' }}</p>
          </div>
        </div>
      </UCard>

      <!-- MotherDuck connection -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database" class="size-5" />
            <span class="font-semibold">Database Connection</span>
          </div>
        </template>
        <div class="space-y-4">
          <UFormField label="MotherDuck Token">
            <UInput
              v-model="newToken"
              :type="showToken ? 'text' : 'password'"
              placeholder="Update your token"
              size="md"
              icon="i-lucide-key"
            >
              <template #trailing>
                <UButton
                  :icon="showToken ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  color="neutral"
                  variant="link"
                  size="sm"
                  @click="showToken = !showToken"
                  :padded="false"
                />
              </template>
            </UInput>
          </UFormField>

          <div class="flex gap-2 flex-wrap">
            <UButton
              size="md"
              variant="soft"
              icon="i-lucide-plug"
              :loading="testing"
              @click="testConnection"
            >
              Test Connection
            </UButton>
            <UButton
              v-if="newToken"
              size="md"
              icon="i-lucide-save"
              :loading="saving"
              @click="updateToken"
            >
              Save Token
            </UButton>
          </div>

          <p v-if="connectionStatus" class="text-sm" :class="connectionOk ? 'text-green-400' : 'text-red-400'">
            {{ connectionStatus }}
          </p>
        </div>
      </UCard>

      <!-- Default Views -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-sliders-horizontal" class="size-5" />
            <span class="font-semibold">Default Views</span>
          </div>
        </template>
        <div class="space-y-5">
          <!-- Default workspace -->
          <div>
            <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider mb-2">Default Workspace</p>
            <div class="flex gap-2 flex-wrap">
              <UButton
                size="sm"
                :color="!prefs.defaultWorkspace ? 'primary' : 'neutral'"
                :variant="!prefs.defaultWorkspace ? 'solid' : 'outline'"
                @click="setDefaultWorkspace(null)"
              >
                All
              </UButton>
              <UButton
                v-for="ws in workspaces"
                :key="ws.id"
                size="sm"
                :color="prefs.defaultWorkspace === ws.id ? 'primary' : 'neutral'"
                :variant="prefs.defaultWorkspace === ws.id ? 'solid' : 'outline'"
                @click="setDefaultWorkspace(ws.id)"
              >
                {{ ws.emoji }} {{ ws.name }}
              </UButton>
            </div>
          </div>

          <!-- Task grouping -->
          <div>
            <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider mb-2">Task Grouping</p>
            <div class="flex gap-2 flex-wrap">
              <UButton v-for="opt in groupOptions" :key="opt.value" size="sm"
                :color="prefs.taskGroupBy === opt.value ? 'primary' : 'neutral'"
                :variant="prefs.taskGroupBy === opt.value ? 'solid' : 'outline'"
                :icon="opt.icon"
                @click="set('taskGroupBy', opt.value)">
                {{ opt.label }}
              </UButton>
            </div>
          </div>

          <!-- Task sorting -->
          <div>
            <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider mb-2">Task Sorting</p>
            <div class="flex gap-2 flex-wrap">
              <UButton v-for="opt in orderOptions" :key="opt.value" size="sm"
                :color="prefs.taskOrderBy === opt.value ? 'primary' : 'neutral'"
                :variant="prefs.taskOrderBy === opt.value ? 'solid' : 'outline'"
                :icon="opt.icon"
                @click="set('taskOrderBy', opt.value)">
                {{ opt.label }}
              </UButton>
            </div>
          </div>

          <!-- Show completed -->
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider">Show Completed Tasks</p>
              <p class="text-xs text-(--ui-text-muted) mt-0.5">Display done tasks in the list by default</p>
            </div>
            <USwitch :model-value="prefs.taskShowDone" @update:model-value="set('taskShowDone', $event)" />
          </div>
        </div>
      </UCard>

    </div>
  </div>
</template>

<script setup lang="ts">
const { username } = useAuth();
const { workspaces, fetchWorkspaces, setActive } = useWorkspace();
const { prefs, set } = usePreferences();

onMounted(() => fetchWorkspaces());

const groupOptions = [
  { value: 'status' as const, label: 'Status', icon: 'i-lucide-circle-dot' },
  { value: 'workspace' as const, label: 'Space', icon: 'i-lucide-folder' },
  { value: 'tag' as const, label: 'Tag', icon: 'i-lucide-tags' },
  { value: 'none' as const, label: 'None', icon: 'i-lucide-list' },
];

const orderOptions = [
  { value: 'created' as const, label: 'Newest', icon: 'i-lucide-clock' },
  { value: 'due' as const, label: 'Due Date', icon: 'i-lucide-calendar' },
];

function setDefaultWorkspace(id: string | null) {
  set('defaultWorkspace', id);
  setActive(id);
}

const newToken = ref('');
const showToken = ref(false);
const testing = ref(false);
const saving = ref(false);
const connectionStatus = ref('');
const connectionOk = ref(false);

const toast = useToast();

async function testConnection() {
  testing.value = true;
  connectionStatus.value = '';
  try {
    await $fetch('/api/setup/test');
    connectionStatus.value = 'Connection successful';
    connectionOk.value = true;
  } catch (err: any) {
    connectionStatus.value = err?.data?.statusMessage || 'Connection failed';
    connectionOk.value = false;
  }
  testing.value = false;
}

async function updateToken() {
  if (!newToken.value) return;
  saving.value = true;
  try {
    await $fetch('/api/setup', {
      method: 'POST',
      body: { username: username.value, motherduck_token: newToken.value },
    });
    toast.add({ title: 'Token updated', description: 'Database connection has been reset.', color: 'success' });
    newToken.value = '';
  } catch (err: any) {
    toast.add({ title: 'Update failed', description: err?.data?.statusMessage || 'Failed to save token', color: 'error' });
  }
  saving.value = false;
}

</script>
