export type AppState = 'loading' | 'setup' | 'ready';

export function useAuth() {
  const appState = useState<AppState>('appState', () => 'loading');
  const username = useState<string | null>('username', () => null);
  const userId = useState<string | null>('userId', () => null);

  async function checkAuth() {
    appState.value = 'loading';
    try {
      const res = await $fetch<{ configured: boolean; username: string; user_id: string }>('/api/auth/check');
      username.value = res.username;
      userId.value = res.user_id;
      appState.value = res.configured ? 'ready' : 'setup';
    } catch {
      appState.value = 'setup';
    }
  }

  async function setup(data: { username: string; motherduck_token: string }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await $fetch<{ ok: boolean; username: string; user_id: string }>('/api/setup', { method: 'POST', body: data });
      username.value = data.username;
      userId.value = res.user_id;
      appState.value = 'ready';
      return { ok: true };
    } catch (err: any) {
      const message = err?.data?.statusMessage || err?.message || 'Setup failed';
      return { ok: false, error: message };
    }
  }

  return { appState, username, userId, checkAuth, setup };
}
