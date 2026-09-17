export type AppState = 'loading' | 'setup' | 'login' | 'ready';

interface AuthUser {
  id: string;
  username: string;
  is_admin: boolean;
}

export function useAuth() {
  const appState = useState<AppState>('appState', () => 'loading');
  const user = useState<AuthUser | null>('authUser', () => null);
  const authNotice = useState<string | null>('authNotice', () => null);

  async function checkAuth(options: { silent?: boolean } = {}): Promise<boolean> {
    const wasReady = appState.value === 'ready' && !!user.value;
    if (!options.silent) appState.value = 'loading';
    try {
      const res = await $fetch<{ configured: boolean; user: AuthUser | null }>('/api/auth/check');
      if (!res.configured) {
        appState.value = 'setup';
        user.value = null;
        authNotice.value = null;
      } else if (!res.user) {
        user.value = null;
        if (wasReady) authNotice.value = 'Your session expired. Sign in to keep working.';
        appState.value = 'login';
      } else {
        user.value = res.user;
        appState.value = 'ready';
        authNotice.value = null;
      }
      return !!res.user;
    } catch {
      // A transient network/database failure is not proof that the session expired.
      // Keep the current app usable and let the next heartbeat retry.
      if (!options.silent && !wasReady) appState.value = 'setup';
      return wasReady;
    }
  }

  async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await $fetch<{ ok: boolean; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      user.value = res.user;
      appState.value = 'ready';
      authNotice.value = null;
      return { ok: true };
    } catch (err: any) {
      const message = err?.data?.statusMessage || err?.message || 'Login failed';
      return { ok: false, error: message };
    }
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear client state even if server call fails
    }
    user.value = null;
    appState.value = 'login';
    authNotice.value = null;
  }

  async function setup(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await $fetch<{ ok: boolean; user: AuthUser }>('/api/setup', {
        method: 'POST',
        body: { username, password },
      });
      user.value = res.user;
      appState.value = 'ready';
      authNotice.value = null;
      return { ok: true };
    } catch (err: any) {
      const message = err?.data?.statusMessage || err?.message || 'Setup failed';
      return { ok: false, error: message };
    }
  }

  async function signup(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await $fetch<{ ok: boolean; user: AuthUser }>('/api/auth/signup', {
        method: 'POST',
        body: { username, password },
      });
      user.value = res.user;
      appState.value = 'ready';
      authNotice.value = null;
      return { ok: true };
    } catch (err: any) {
      const message = err?.data?.statusMessage || err?.message || 'Signup failed';
      return { ok: false, error: message };
    }
  }

  return { appState, user, authNotice, checkAuth, login, logout, setup, signup };
}
