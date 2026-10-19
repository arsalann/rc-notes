<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'end', side: 'bottom', sideOffset: 8 }"
    :ui="{ content: 'z-50 w-72 rounded-xl border border-(--ui-border) bg-(--ui-bg-elevated) p-2 shadow-2xl' }"
    class="shrink-0"
  >
    <UButton
      type="button"
      color="neutral"
      variant="soft"
      size="sm"
      icon="i-lucide-tags"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="menu"
    >
      {{ label }}<span v-if="selectedKeys.size" class="ml-1 text-(--ui-text-dimmed)">· {{ selectedKeys.size }}</span>
    </UButton>
    <template #content>
      <div role="menu" class="max-h-80 overflow-y-auto overscroll-contain">
        <p class="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-(--ui-text-dimmed)">
          Choose manual tags
        </p>
        <button
          v-for="tag in options"
          :key="tag.key"
          type="button"
          role="menuitemcheckbox"
          :aria-checked="isSelected(tag.key)"
          class="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
          :class="isSelected(tag.key) ? 'bg-(--ui-primary)/15 text-(--ui-text)' : 'text-(--ui-text-muted) active:bg-(--ui-bg-accented)'"
          @click="toggle(tag)"
        >
          <span class="text-base leading-none w-5 text-center" aria-hidden="true">{{ tag.emoji || '#' }}</span>
          <span class="flex-1">{{ tag.label }}</span>
          <UIcon v-if="isSelected(tag.key)" name="i-lucide-check" class="size-4 text-(--ui-primary)" />
        </button>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { manualTaskTagKey, TASK_TAG_CATALOG } from '~/utils/taskTags';

const props = withDefaults(defineProps<{
  modelValue?: readonly string[];
  label?: string;
  disabled?: boolean;
}>(), {
  modelValue: () => [],
  label: 'Add / change tags',
  disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [tags: string[]] }>();
const open = ref(false);
const { tags, ensureLoaded } = useTagSettings();
ensureLoaded();

const selectedKeys = computed(() => new Set(
  props.modelValue
    .map(manualTaskTagKey)
    .filter((key): key is string => key !== null),
));

interface PickerOption { key: string; label: string; emoji: string | null; value: string }

/**
 * Built-in tags, then custom tags already in use, with Settings labels. Archived tags are left out
 * unless this item already has them (so they can still be removed).
 */
const options = computed<PickerOption[]>(() => {
  const list: PickerOption[] = tags.value.length
    ? tags.value.map(t => ({ key: t.key, label: t.label, emoji: t.emoji, value: t.builtin ? t.key : t.name, archived: t.archived }))
      .filter(t => !t.archived || selectedKeys.value.has(t.key))
    : TASK_TAG_CATALOG.map(t => ({ key: t.key, label: t.label, emoji: t.emoji, value: t.key }));
  return list;
});

function isSelected(key: string): boolean {
  return selectedKeys.value.has(key);
}

function toggle(tag: PickerOption) {
  const next = isSelected(tag.key)
    ? props.modelValue.filter(raw => manualTaskTagKey(raw) !== tag.key)
    : [...props.modelValue, tag.value];
  emit('update:modelValue', next);
}
</script>
