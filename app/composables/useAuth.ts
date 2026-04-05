export type AppState = 'loading' | 'login' | 'setup' | 'ready';

export function useAuth() {
  const appState = useState<AppState>('appState', () => 'loading');
  const username = useState<string | null>('username', () => null);

  async function checkAuth() {
    appState.value = 'loading';
    try {
      const res = await $fetch<{ authenticated: boolean; username: string; configured: boolean }>('/api/auth/check');
      username.value = res.username;
      appState.value = res.configured ? 'ready' : 'setup';
    } catch {
      appState.value = 'login';
    }
  }

  async function login(password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await $fetch<{ ok: boolean; username: string }>('/api/auth/login', {
        method: 'POST',
        body: { password },
      });
      username.value = res.username;
      await checkAuth();
      return { ok: true };
    } catch (err: any) {
      const message = err?.data?.statusMessage || err?.message || 'Login failed';
      return { ok: false, error: message };
    }
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    username.value = null;
    appState.value = 'login';
  }

  async function setup(data: { username: string; motherduck_token: string }): Promise<{ ok: boolean; error?: string }> {
    try {
      await $fetch('/api/setup', { method: 'POST', body: data });
      username.value = data.username;
      appState.value = 'ready';
      return { ok: true };
    } catch (err: any) {
      const message = err?.data?.statusMessage || err?.message || 'Setup failed';
      return { ok: false, error: message };
    }
  }

  return { appState, username, checkAuth, login, logout, setup };
}
