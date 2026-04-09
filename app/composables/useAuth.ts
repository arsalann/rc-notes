export type AppState = 'loading' | 'setup' | 'login' | 'ready';

interface AuthUser {
  id: string;
  username: string;
  is_admin: boolean;
}

export function useAuth() {
  const appState = useState<AppState>('appState', () => 'loading');
  const user = useState<AuthUser | null>('authUser', () => null);

  async function checkAuth() {
    appState.value = 'loading';
    try {
      const res = await $fetch<{ configured: boolean; user: AuthUser | null }>('/api/auth/check');
      if (!res.configured) {
        appState.value = 'setup';
      } else if (!res.user) {
        appState.value = 'login';
      } else {
        user.value = res.user;
        appState.value = 'ready';
      }
    } catch {
      appState.value = 'setup';
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
  }

  async function setup(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await $fetch<{ ok: boolean; user: AuthUser }>('/api/setup', {
        method: 'POST',
        body: { username, password },
      });
      user.value = res.user;
      appState.value = 'ready';
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
      return { ok: true };
    } catch (err: any) {
      const message = err?.data?.statusMessage || err?.message || 'Signup failed';
      return { ok: false, error: message };
    }
  }

  return { appState, user, checkAuth, login, logout, setup, signup };
}
