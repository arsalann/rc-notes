import { beforeEach, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { useWorkspace } from './useWorkspace';

let states: Map<string, ReturnType<typeof ref>>;
const owned = [{ id: 'review-work', name: 'Work', emoji: '', position: 0 }];
beforeEach(() => {
  states = new Map();
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(init()));
    return states.get(key);
  });
  vi.stubGlobal('computed', computed);
  vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(owned));
});

it('drops another account workspace before subsequent task and diary writes', async () => {
  const ws = useWorkspace();
  ws.setActive('previous-account-work');
  await ws.fetchWorkspaces();
  expect(ws.activeId.value).toBeNull();
  expect(ws.active.value).toBeNull();
  expect(useWorkspace().activeId.value).toBeNull();
  ws.setActive('review-work');
  await ws.fetchWorkspaces();
  expect(ws.active.value?.id).toBe('review-work');
});

it('keeps an owned workspace and the explicit all-workspaces selection', async () => {
  const ws = useWorkspace();
  ws.setActive('review-work');
  await ws.fetchWorkspaces();
  expect(ws.activeId.value).toBe('review-work');
  ws.setActive(null);
  await ws.fetchWorkspaces();
  expect(ws.activeId.value).toBeNull();
});
