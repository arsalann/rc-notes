<template>
  <span v-if="visibleTags.length" class="inline-flex items-center gap-1 shrink-0 task-tag-icons">
    <span
      v-for="tag in visibleTags"
      :key="tag.key"
      role="img"
      :aria-label="tagDescription(tag)"
      :title="tagDescription(tag)"
      class="inline-flex size-5 items-center justify-center text-sm leading-none"
    >{{ tag.emoji }}</span>
    <span
      v-if="hiddenTags.length"
      :aria-label="`${hiddenTags.length} more tags: ${hiddenTags.map(tag => tag.label).join(', ')}`"
      :title="hiddenTags.map(tag => tag.label).join(', ')"
      class="text-[11px] font-semibold leading-none text-(--ui-text-dimmed)"
    >+{{ hiddenTags.length }}</span>
  </span>
</template>

<script setup lang="ts">
import {
  emojiTaskTags,
  visibleEmojiTaskTags,
  type ResolvedTaskTag,
} from '~/utils/taskTags';

const props = withDefaults(defineProps<{
  tags?: readonly ResolvedTaskTag[] | null;
  limit?: number;
}>(), { limit: 2 });

// Settings → Tags can relabel a tag or give a custom tag an emoji.
const { presentAll, ensureLoaded } = useTagSettings();
ensureLoaded();
const presented = computed(() => presentAll(props.tags));
const visibleTags = computed(() => visibleEmojiTaskTags(presented.value, props.limit));
const hiddenTags = computed(() => emojiTaskTags(presented.value).slice(props.limit));

function tagDescription(tag: ResolvedTaskTag): string {
  const reasons: string[] = [];
  if (tag.sources.includes('manual')) reasons.push('manual tag');
  if (tag.sources.includes('title')) reasons.push('detected from task title');
  if (tag.sources.includes('parent')) reasons.push('inherited from parent title');
  const matchedTerms = tag.matched_terms.filter(term => term.trim());
  const matchDetail = matchedTerms.length ? `: ${matchedTerms.join(', ')}` : '';
  return `${tag.label} — ${reasons.join('; ')}${matchDetail}`;
}
</script>
