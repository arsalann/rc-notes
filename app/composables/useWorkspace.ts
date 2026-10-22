export interface Workspace {
  id: string;
  name: string;
  emoji: string;
  position: number;
}

export function useWorkspace() {
  const workspaces = useState<Workspace[]>('workspaces', () => []);
  const activeId = useState<string | null>('activeWorkspace', () => null);
  const restored = useState<boolean>('workspaceRestored', () => false);

  const active = computed(() => workspaces.value.find(w => w.id === activeId.value) || null);

  async function fetchWorkspaces() {
    workspaces.value = await $fetch<Workspace[]>('/api/workspaces');
    // Device preferences can refer to a different signed-in account. Never use
    // an unavailable workspace as a write target. Null means all workspaces.
    if (activeId.value && !workspaces.value.some(w => w.id === activeId.value)) {
      setActive(null);
    }
  }

  function setActive(id: string | null) {
    activeId.value = id;
    if (import.meta.client) {
      if (id) localStorage.setItem('workspace', id);
      else localStorage.removeItem('workspace');
    }
  }

  async function createWorkspace(data: { name: string; emoji: string }) {
    const ws = await $fetch<Workspace>('/api/workspaces', { method: 'POST', body: data });
    workspaces.value.push(ws);
    return ws;
  }

  // Restore from localStorage, fall back to default preference
  if (import.meta.client && !restored.value) {
    restored.value = true;
    const stored = localStorage.getItem('workspace');
    if (stored) {
      activeId.value = stored;
    } else {
      try {
        const raw = localStorage.getItem('preferences');
        if (raw) {
          const p = JSON.parse(raw);
          if (p.defaultWorkspace) activeId.value = p.defaultWorkspace;
        }
      } catch {}
    }
  }

  return { workspaces, active, activeId, fetchWorkspaces, setActive, createWorkspace };
}
