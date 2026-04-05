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

          <div class="flex gap-2">
            <UButton
              size="sm"
              variant="soft"
              icon="i-lucide-plug"
              :loading="testing"
              @click="testConnection"
            >
              Test Connection
            </UButton>
            <UButton
              v-if="newToken"
              size="sm"
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

      <!-- Danger zone -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2 text-red-400">
            <UIcon name="i-lucide-log-out" class="size-5" />
            <span class="font-semibold">Session</span>
          </div>
        </template>
        <UButton color="error" variant="soft" icon="i-lucide-log-out" @click="handleLogout">
          Sign Out
        </UButton>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const { username, logout } = useAuth();

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

async function handleLogout() {
  await logout();
}
</script>
