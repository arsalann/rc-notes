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

      <!-- Login / Signup form -->
      <template v-else>
        <div class="text-center">
          <h1 class="text-3xl font-bold tracking-tight">rc-notes</h1>
          <p class="mt-2 text-sm text-(--ui-text-dimmed)">
            {{ isSignup ? 'Create your account' : 'Sign in to continue' }}
          </p>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-5">
          <UFormField label="Username">
            <UInput
              v-model="form.username"
              :placeholder="isSignup ? 'Choose a username' : 'Your username'"
              size="lg"
              autofocus
              :disabled="submitting"
              icon="i-lucide-user"
            />
            <template v-if="isSignup" #hint>
              <span class="text-xs text-(--ui-text-dimmed)">2-30 characters, letters, numbers, underscore</span>
            </template>
          </UFormField>

          <UFormField label="Password">
            <UInput
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              :placeholder="isSignup ? 'At least 8 characters' : 'Your password'"
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

          <UFormField v-if="isSignup" label="Confirm Password">
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
            {{ isSignup ? 'Create Account' : 'Sign In' }}
          </UButton>

          <p v-if="error" class="text-sm text-red-400 text-center">{{ error }}</p>
        </form>

        <p class="text-center text-sm text-(--ui-text-dimmed)">
          <template v-if="isSignup">
            Already have an account?
            <UButton variant="link" size="sm" :padded="false" @click="mode = 'login'">Sign in</UButton>
          </template>
          <template v-else>
            Don't have an account?
            <UButton variant="link" size="sm" :padded="false" @click="mode = 'signup'">Create one</UButton>
          </template>
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
const { login, signup } = useAuth();

const mode = ref<'choose' | 'login' | 'signup'>('choose');
const isSignup = computed(() => mode.value === 'signup');
const form = reactive({ username: '', password: '', confirmPassword: '' });
const showPassword = ref(false);
const error = ref('');
const submitting = ref(false);

const canSubmit = computed(() => {
  if (!form.username || !form.password) return false;
  if (isSignup.value) {
    return form.username.length >= 2 && form.password.length >= 8 && form.password === form.confirmPassword;
  }
  return true;
});

watch(mode, () => {
  error.value = '';
  form.confirmPassword = '';
});

async function handleSubmit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = '';

  if (isSignup.value) {
    if (form.password !== form.confirmPassword) {
      error.value = 'Passwords do not match';
      submitting.value = false;
      return;
    }
    const result = await signup(form.username, form.password);
    submitting.value = false;
    if (!result.ok) {
      error.value = result.error || 'Signup failed';
    }
  } else {
    const result = await login(form.username, form.password);
    submitting.value = false;
    if (!result.ok) {
      error.value = result.error || 'Login failed';
    }
  }
}
</script>
