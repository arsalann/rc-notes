export interface Preferences {
  defaultWorkspace: string | null;
  taskGroupBy: 'none' | 'workspace' | 'tag' | 'status' | 'priority';
  taskOrderBy: 'created' | 'due';
  taskShowDone: boolean;
}

const STORAGE_KEY = 'preferences';

const defaults: Preferences = {
  defaultWorkspace: null,
  taskGroupBy: 'status',
  taskOrderBy: 'created',
  taskShowDone: true,
};

function load(): Preferences {
  if (!import.meta.client) return { ...defaults };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return { ...defaults };
}

function persist(prefs: Preferences) {
  if (import.meta.client) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }
}

export function usePreferences() {
  const prefs = useState<Preferences>('preferences', () => load());

  // Restore from localStorage on client (in case useState ran on server)
  if (import.meta.client) {
    const stored = load();
    prefs.value = stored;
  }

  function set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    prefs.value = { ...prefs.value, [key]: value };
    persist(prefs.value);
  }

  return { prefs, set };
}
