<template>
  <div class="min-h-screen flex items-center justify-center px-6">
    <div class="w-full max-w-sm space-y-8">
      <div class="text-center">
        <h1 class="text-3xl font-bold tracking-tight">rc-notes</h1>
        <p class="mt-2 text-sm text-(--ui-text-dimmed)">Sign in to continue</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-5">
        <UFormField label="Username">
          <UInput
            v-model="form.username"
            placeholder="Your username"
            size="lg"
            autofocus
            :disabled="submitting"
            icon="i-lucide-user"
          />
        </UFormField>

        <UFormField label="Password">
          <UInput
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Your password"
            size="lg"
            :disabled="submitting"
            icon="i-lucide-lock"
          >
            <template #trailing>
              <UButton
                :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                color="neutral"
                variant="link"
                size="sm"
                @click="showPassword = !showPassword"
                :padded="false"
              />
            </template>
          </UInput>
        </UFormField>

        <UButton
          type="submit"
          block
          size="lg"
          :loading="submitting"
          :disabled="!form.username || !form.password"
        >
          Sign In
        </UButton>

        <p v-if="error" class="text-sm text-red-400 text-center">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const { login } = useAuth();

const form = reactive({ username: '', password: '' });
const showPassword = ref(false);
const error = ref('');
const submitting = ref(false);

async function handleLogin() {
  if (!form.username || !form.password) return;
  submitting.value = true;
  error.value = '';
  const result = await login(form.username, form.password);
  submitting.value = false;
  if (!result.ok) {
    error.value = result.error || 'Login failed';
  }
}
</script>
