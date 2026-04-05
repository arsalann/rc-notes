<template>
  <div class="min-h-screen flex items-center justify-center px-6">
    <div class="w-full max-w-sm space-y-8">
      <div class="text-center">
        <h1 class="text-3xl font-bold tracking-tight">Welcome to rc-notes</h1>
        <p class="mt-2 text-sm text-(--ui-text-dimmed)">Let's get you set up</p>
      </div>

      <form @submit.prevent="handleSetup" class="space-y-5">
        <UFormField label="Your name">
          <UInput
            v-model="form.username"
            placeholder="e.g. Arsalan"
            size="lg"
            autofocus
            :disabled="submitting"
            icon="i-lucide-user"
          />
        </UFormField>

        <UFormField label="MotherDuck API Token">
          <UInput
            v-model="form.motherduck_token"
            :type="showToken ? 'text' : 'password'"
            placeholder="Your MotherDuck token"
            size="lg"
            :disabled="submitting"
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
          <template #hint>
            <span class="text-xs text-(--ui-text-dimmed)">
              Get your token from
              <a href="https://app.motherduck.com/settings/tokens" target="_blank" rel="noopener" class="underline text-purple-400 hover:text-purple-300">
                MotherDuck Settings
              </a>
            </span>
          </template>
        </UFormField>

        <UButton
          type="submit"
          block
          size="lg"
          :loading="submitting"
          :disabled="!form.username || !form.motherduck_token"
        >
          Get Started
        </UButton>

        <p v-if="error" class="text-sm text-red-400 text-center">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const { setup } = useAuth();

const form = reactive({ username: '', motherduck_token: '' });
const showToken = ref(false);
const error = ref('');
const submitting = ref(false);

async function handleSetup() {
  if (!form.username || !form.motherduck_token) return;
  submitting.value = true;
  error.value = '';
  const result = await setup({ username: form.username, motherduck_token: form.motherduck_token });
  submitting.value = false;
  if (!result.ok) {
    error.value = result.error || 'Setup failed';
  }
}
</script>
