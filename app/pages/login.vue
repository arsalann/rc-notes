<template>
  <div class="min-h-screen flex items-center justify-center px-6">
    <div class="w-full max-w-sm space-y-8">
      <div class="text-center">
        <h1 class="text-3xl font-bold tracking-tight">rc-notes</h1>
        <p class="mt-2 text-sm text-(--ui-text-dimmed)">Enter your password to continue</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <UFormField label="Password">
          <UInput
            v-model="password"
            type="password"
            placeholder="Master password"
            size="lg"
            autofocus
            :disabled="submitting"
            icon="i-lucide-lock"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          size="lg"
          :loading="submitting"
          :disabled="!password"
        >
          Sign in
        </UButton>

        <p v-if="error" class="text-sm text-red-400 text-center">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const { login } = useAuth();

const password = ref('');
const error = ref('');
const submitting = ref(false);

async function handleLogin() {
  if (!password.value) return;
  submitting.value = true;
  error.value = '';
  const result = await login(password.value);
  submitting.value = false;
  if (!result.ok) {
    error.value = result.error || 'Invalid password';
    password.value = '';
  }
}
</script>
