<template>
  <div class="min-h-screen flex items-center justify-center px-6">
    <div class="w-full max-w-sm space-y-8">
      <!-- Welcome screen -->
      <template v-if="mode === 'choose'">
        <div class="text-center space-y-2">
          <h1 class="text-3xl font-bold tracking-tight">rc-notes</h1>
          <p class="text-sm text-(--ui-text-dimmed)">Your personal notes and tasks</p>
        </div>

        <div class="space-y-3">
          <UButton block size="lg" @click="mode = 'login'">
            Sign In
          </UButton>
          <UButton block size="lg" color="neutral" variant="soft" @click="mode = 'signup'">
            Create Account
          </UButton>
        </div>
      </template>

      <!-- Sign In form -->
      <template v-else-if="mode === 'login'">
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

        <p class="text-center text-sm text-(--ui-text-dimmed)">
          Don't have an account?
          <UButton variant="link" size="sm" :padded="false" @click="mode = 'signup'">Create one</UButton>
        </p>
      </template>

      <!-- Create Account form -->
      <template v-else>
        <div class="text-center">
          <h1 class="text-3xl font-bold tracking-tight">rc-notes</h1>
          <p class="mt-2 text-sm text-(--ui-text-dimmed)">Create your account</p>
        </div>

        <form @submit.prevent="handleSetup" class="space-y-5">
          <UFormField label="Username">
            <UInput
              v-model="form.username"
              placeholder="Choose a username"
              size="lg"
              autofocus
              :disabled="submitting"
              icon="i-lucide-user"
            />
            <template #hint>
              <span class="text-xs text-(--ui-text-dimmed)">2-30 characters, letters, numbers, underscore</span>
            </template>
          </UFormField>

          <UFormField label="Password">
            <UInput
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="At least 8 characters"
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

          <UFormField label="Confirm Password">
            <UInput
              v-model="form.confirmPassword"
              type="password"
              placeholder="Repeat your password"
              size="lg"
              :disabled="submitting"
              icon="i-lucide-lock"
            />
          </UFormField>

          <UButton
            type="submit"
            block
            size="lg"
            :loading="submitting"
            :disabled="!canSubmit"
          >
            Create Account
          </UButton>

          <p v-if="error" class="text-sm text-red-400 text-center">{{ error }}</p>
        </form>

        <p class="text-center text-sm text-(--ui-text-dimmed)">
          Already have an account?
          <UButton variant="link" size="sm" :padded="false" @click="mode = 'login'">Sign in</UButton>
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
const { setup, login } = useAuth();

const mode = ref<'choose' | 'login' | 'signup'>('choose');
const form = reactive({ username: '', password: '', confirmPassword: '' });
const showPassword = ref(false);
const error = ref('');
const submitting = ref(false);

watch(mode, () => {
  error.value = '';
  form.confirmPassword = '';
});

const canSubmit = computed(() =>
  form.username.length >= 2 &&
  form.password.length >= 8 &&
  form.password === form.confirmPassword
);

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

async function handleSetup() {
  if (!canSubmit.value) return;

  if (form.password !== form.confirmPassword) {
    error.value = 'Passwords do not match';
    return;
  }

  submitting.value = true;
  error.value = '';
  const result = await setup(form.username, form.password);
  submitting.value = false;
  if (!result.ok) {
    error.value = result.error || 'Setup failed';
  }
}
</script>
