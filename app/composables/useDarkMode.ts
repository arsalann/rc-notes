export function useDarkMode() {
  const isDark = useState('darkMode', () => false);

  if (import.meta.client) {
    const stored = localStorage.getItem('darkMode');
    if (stored !== null) {
      isDark.value = stored === 'true';
    } else {
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    watch(isDark, (val) => {
      document.documentElement.classList.toggle('dark', val);
      localStorage.setItem('darkMode', String(val));
    }, { immediate: true });
  }

  function toggle() {
    isDark.value = !isDark.value;
  }

  return { isDark, toggle };
}
