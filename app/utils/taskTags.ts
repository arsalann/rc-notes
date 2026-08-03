export type TaskTagSource = 'manual' | 'title' | 'parent';

export interface TaskTagDefinition {
  key: string;
  label: string;
  emoji: string;
  matchers: readonly string[];
  aliases?: readonly string[];
}

export interface ResolvedTaskTag {
  key: string;
  label: string;
  emoji: string | null;
  sources: TaskTagSource[];
  matched_terms: string[];
}

export interface ResolveTaskTagsInput {
  title?: string | null;
  parentTitle?: string | null;
  manualTags?: readonly string[] | null;
}

export interface TaskTagResolution {
  detected_tags: ResolvedTaskTag[];
  resolved_tags: ResolvedTaskTag[];
}

export const TASK_TAG_CATALOG: readonly TaskTagDefinition[] = [
  {
    key: 'data-stack',
    label: 'Data stack',
    emoji: '🛠️',
    matchers: ['bruin', 'ingestr', 'duckdb', 'ducklake', 'clickhouse', 'fivetran', 'dbt'],
  },
  {
    key: 'content',
    label: 'Content',
    emoji: '✍️',
    matchers: ['blog', 'tutorial', 'docs', 'academy', 'course', 'masterclass', 'video'],
    aliases: ['doc', 'read'],
  },
  {
    key: 'growth',
    label: 'Growth',
    emoji: '📈',
    matchers: ['growth', 'marketing', 'launch', 'promote', 'linkedin', 'reddit', 'seo', 'social'],
  },
  {
    key: 'community',
    label: 'Community',
    emoji: '🎤',
    matchers: ['community', 'event', 'webinar', 'meetup', 'office hours', 'fireside', 'luma', 'pydata', 'slack'],
  },
  {
    key: 'partnerships',
    label: 'Partnerships',
    emoji: '🤝',
    matchers: ['partner', 'partnership', 'partnerstack'],
  },
  {
    key: 'customers',
    label: 'Customers',
    emoji: '👥',
    matchers: ['customer', 'user', 'icp', 'outreach', 'sales', 'client'],
    aliases: ['icp'],
  },
  {
    key: 'travel',
    label: 'Travel',
    emoji: '✈️',
    matchers: ['trip', 'bcn', 'hotel', 'flight'],
    aliases: ['trip'],
  },
  {
    key: 'personal-admin',
    label: 'Personal admin',
    emoji: '🧾',
    matchers: ["driver's license", 'vodafone', 'revolut', 'groceries', 'nail clippers'],
  },
];

const catalogByKey = new Map(TASK_TAG_CATALOG.map(tag => [tag.key, tag]));
const catalogOrder = new Map(TASK_TAG_CATALOG.map((tag, index) => [tag.key, index]));
const manualAliasToKey = new Map<string, string>();

for (const tag of TASK_TAG_CATALOG) {
  manualAliasToKey.set(normalizeTaskTagText(tag.key), tag.key);
  manualAliasToKey.set(normalizeTaskTagText(tag.label), tag.key);
  for (const alias of tag.aliases || []) {
    manualAliasToKey.set(normalizeTaskTagText(alias), tag.key);
  }
}

/**
 * Normalizes text into a space-delimited form so keyword matching remains
 * case-insensitive and cannot match a substring inside another word.
 */
export function normalizeTaskTagText(input: string | null | undefined): string {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function matcherMatches(normalizedText: string, matcher: string): boolean {
  const normalizedMatcher = normalizeTaskTagText(matcher);
  if (!normalizedText || !normalizedMatcher) return false;
  return ` ${normalizedText} `.includes(` ${normalizedMatcher} `);
}

function detectFromText(text: string | null | undefined, source: 'title' | 'parent'): ResolvedTaskTag[] {
  const normalizedText = normalizeTaskTagText(text);
  if (!normalizedText) return [];

  return TASK_TAG_CATALOG.flatMap((definition) => {
    const matchedTerms = definition.matchers.filter(matcher => matcherMatches(normalizedText, matcher));
    if (!matchedTerms.length) return [];
    return [{
      key: definition.key,
      label: definition.label,
      emoji: definition.emoji,
      sources: [source],
      matched_terms: matchedTerms,
    }];
  });
}

export function canonicalManualTaskTagKey(rawTag: string | null | undefined): string | null {
  const normalized = normalizeTaskTagText(rawTag);
  return normalized ? manualAliasToKey.get(normalized) || null : null;
}

function resolveManualTag(rawTag: string): ResolvedTaskTag | null {
  const label = rawTag.trim();
  const normalized = normalizeTaskTagText(label);
  if (!normalized) return null;

  const catalogKey = canonicalManualTaskTagKey(label);
  const definition = catalogKey ? catalogByKey.get(catalogKey) : undefined;
  if (definition) {
    return {
      key: definition.key,
      label: definition.label,
      emoji: definition.emoji,
      sources: ['manual'],
      matched_terms: [label],
    };
  }

  return {
    key: `manual:${normalized}`,
    label,
    emoji: null,
    sources: ['manual'],
    matched_terms: [label],
  };
}

function mergeTags(tags: ResolvedTaskTag[]): ResolvedTaskTag[] {
  const byKey = new Map<string, ResolvedTaskTag>();

  for (const tag of tags) {
    const current = byKey.get(tag.key);
    if (!current) {
      byKey.set(tag.key, {
        ...tag,
        sources: [...tag.sources],
        matched_terms: [...tag.matched_terms],
      });
      continue;
    }

    for (const source of tag.sources) {
      if (!current.sources.includes(source)) current.sources.push(source);
    }
    for (const term of tag.matched_terms) {
      if (!current.matched_terms.includes(term)) current.matched_terms.push(term);
    }
  }

  return [...byKey.values()].sort(compareResolvedTaskTags);
}

function contextRank(tag: ResolvedTaskTag): number {
  return tag.sources.includes('manual') || tag.sources.includes('title') ? 0 : 1;
}

export function compareResolvedTaskTags(a: ResolvedTaskTag, b: ResolvedTaskTag): number {
  const contextDifference = contextRank(a) - contextRank(b);
  if (contextDifference) return contextDifference;

  const catalogDifference = (catalogOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER)
    - (catalogOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER);
  if (catalogDifference) return catalogDifference;

  return a.label.localeCompare(b.label);
}

/**
 * Resolves manual aliases plus automatic direct and parent-context matches.
 * No result is persisted; callers can safely rerun this whenever titles change.
 */
export function resolveTaskTags(input: ResolveTaskTagsInput): TaskTagResolution {
  const manualTags = (input.manualTags || [])
    .filter((tag): tag is string => typeof tag === 'string')
    .map(resolveManualTag)
    .filter((tag): tag is ResolvedTaskTag => tag !== null);
  const directTags = detectFromText(input.title, 'title');
  const parentTags = detectFromText(input.parentTitle, 'parent');

  return {
    detected_tags: mergeTags([...directTags, ...parentTags]),
    resolved_tags: mergeTags([...manualTags, ...directTags, ...parentTags]),
  };
}

/** Returns only catalog-backed tags eligible for compact emoji rendering. */
export function emojiTaskTags(tags: readonly ResolvedTaskTag[] | null | undefined): ResolvedTaskTag[] {
  return (tags || []).filter((tag): tag is ResolvedTaskTag => Boolean(tag?.emoji));
}

export function visibleEmojiTaskTags(
  tags: readonly ResolvedTaskTag[] | null | undefined,
  limit = 2,
): ResolvedTaskTag[] {
  return emojiTaskTags(tags).slice(0, limit);
}

export function hiddenEmojiTaskTagCount(
  tags: readonly ResolvedTaskTag[] | null | undefined,
  limit = 2,
): number {
  return Math.max(emojiTaskTags(tags).length - limit, 0);
}
