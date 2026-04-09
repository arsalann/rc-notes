<template>
  <div class="max-w-lg mx-auto">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg px-4 pt-5 pb-3 safe-top">
      <h1 class="text-2xl font-bold tracking-tight">Settings</h1>
    </div>

    <div class="px-4 mt-4 space-y-6 pb-36">
      <!-- Account -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-user" class="size-5" />
            <span class="font-semibold">Account</span>
          </div>
        </template>
        <div class="space-y-4">
          <div>
            <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider">Username</p>
            <p class="text-sm font-medium mt-0.5">{{ user?.username || 'Unknown' }}</p>
          </div>
          <div>
            <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider">Role</p>
            <p class="text-sm font-medium mt-0.5">{{ user?.is_admin ? 'Admin' : 'User' }}</p>
          </div>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-log-out"
            @click="handleLogout"
          >
            Sign Out
          </UButton>
        </div>
      </UCard>

      <!-- Change Password -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-lock" class="size-5" />
            <span class="font-semibold">Change Password</span>
          </div>
        </template>
        <form @submit.prevent="changePassword" class="space-y-4">
          <UFormField label="Current Password">
            <UInput
              v-model="pw.current"
              type="password"
              placeholder="Enter current password"
              size="md"
              icon="i-lucide-key"
            />
          </UFormField>
          <UFormField label="New Password">
            <UInput
              v-model="pw.newPw"
              type="password"
              placeholder="At least 8 characters"
              size="md"
              icon="i-lucide-key"
            />
          </UFormField>
          <UFormField label="Confirm New Password">
            <UInput
              v-model="pw.confirm"
              type="password"
              placeholder="Repeat new password"
              size="md"
              icon="i-lucide-key"
            />
          </UFormField>
          <UButton
            type="submit"
            size="md"
            :loading="pwSaving"
            :disabled="!pw.current || pw.newPw.length < 8 || pw.newPw !== pw.confirm"
          >
            Update Password
          </UButton>
        </form>
      </UCard>

      <!-- User Management (admin only) -->
      <UCard v-if="user?.is_admin">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-users" class="size-5" />
            <span class="font-semibold">Users</span>
          </div>
        </template>
        <div class="space-y-4">
          <!-- Existing users -->
          <div v-for="u in users" :key="u.id" class="flex items-center justify-between py-2">
            <div>
              <span class="text-sm font-medium">{{ u.username }}</span>
              <UBadge v-if="u.is_admin" color="primary" variant="subtle" size="xs" class="ml-2">Admin</UBadge>
            </div>
            <UButton
              v-if="u.id !== user?.id"
              color="error"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              @click="deleteUser(u.id)"
            />
          </div>

          <!-- Add user form -->
          <div class="border-t border-(--ui-border) pt-4">
            <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider mb-3">Add User</p>
            <form @submit.prevent="addUser" class="space-y-3">
              <UInput
                v-model="newUser.username"
                placeholder="Username"
                size="md"
                icon="i-lucide-user"
              />
              <UInput
                v-model="newUser.password"
                type="password"
                placeholder="Password (min 8 chars)"
                size="md"
                icon="i-lucide-lock"
              />
              <UButton
                type="submit"
                size="md"
                variant="soft"
                :loading="addingUser"
                :disabled="!newUser.username || newUser.password.length < 8"
                icon="i-lucide-user-plus"
              >
                Add User
              </UButton>
            </form>
          </div>
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
const { user, logout } = useAuth();
const { workspaces, fetchWorkspaces, setActive } = useWorkspace();
const { prefs, set } = usePreferences();
const toast = useToast();

onMounted(() => {
  fetchWorkspaces();
  if (user.value?.is_admin) loadUsers();
});

// --- Logout ---
async function handleLogout() {
  await logout();
}

// --- Change Password ---
const pw = reactive({ current: '', newPw: '', confirm: '' });
const pwSaving = ref(false);

async function changePassword() {
  if (pw.newPw !== pw.confirm) {
    toast.add({ title: 'Passwords do not match', color: 'error' });
    return;
  }
  pwSaving.value = true;
  try {
    await $fetch('/api/auth/password', {
      method: 'PUT',
      body: { current_password: pw.current, new_password: pw.newPw },
    });
    toast.add({ title: 'Password updated', color: 'success' });
    pw.current = '';
    pw.newPw = '';
    pw.confirm = '';
  } catch (err: any) {
    toast.add({ title: 'Failed', description: err?.data?.statusMessage || 'Could not update password', color: 'error' });
  }
  pwSaving.value = false;
}

// --- User Management ---
const users = ref<any[]>([]);
const newUser = reactive({ username: '', password: '' });
const addingUser = ref(false);

async function loadUsers() {
  try {
    users.value = await $fetch<any[]>('/api/users');
  } catch {}
}

async function addUser() {
  if (!newUser.username || newUser.password.length < 8) return;
  addingUser.value = true;
  try {
    await $fetch('/api/users', {
      method: 'POST',
      body: { username: newUser.username, password: newUser.password },
    });
    toast.add({ title: `User "${newUser.username}" created`, color: 'success' });
    newUser.username = '';
    newUser.password = '';
    await loadUsers();
  } catch (err: any) {
    toast.add({ title: 'Failed', description: err?.data?.statusMessage || 'Could not add user', color: 'error' });
  }
  addingUser.value = false;
}

async function deleteUser(id: string) {
  try {
    await $fetch(`/api/users/${id}`, { method: 'DELETE' });
    toast.add({ title: 'User deleted', color: 'success' });
    await loadUsers();
  } catch (err: any) {
    toast.add({ title: 'Failed', description: err?.data?.statusMessage || 'Could not delete user', color: 'error' });
  }
}

// --- Preferences ---
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
</script>
