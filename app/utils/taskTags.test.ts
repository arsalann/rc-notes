import { describe, expect, it } from 'vitest';
import { parseHashtags } from '../composables/useHashtagParse';
import {
  emojiTaskTags,
  hiddenEmojiTaskTagCount,
  canonicalManualTaskTagKey,
  normalizeTaskTagText,
  resolveTaskTags,
  visibleEmojiTaskTags,
} from './taskTags';

describe('task tag resolver', () => {
  it('matches case-insensitive direct keywords and keeps catalog ordering', () => {
    const result = resolveTaskTags({ title: 'Publish a BRUIN tutorial on LinkedIn' });

    expect(result.detected_tags.map(tag => tag.key)).toEqual(['data-stack', 'content', 'growth']);
    expect(result.resolved_tags.map(tag => tag.emoji)).toEqual(['🛠️', '✍️', '📈']);
    expect(result.detected_tags[0].sources).toEqual(['title']);
  });

  it('normalizes punctuation and matches explicit phrases', () => {
    const result = resolveTaskTags({ title: 'Renew my driver’s-license with Vodafone' });

    expect(normalizeTaskTagText("Driver’s-license")).toBe('drivers license');
    expect(result.resolved_tags).toHaveLength(1);
    expect(result.resolved_tags[0]).toMatchObject({
      key: 'personal-admin',
      matched_terms: ["driver's license", 'vodafone'],
    });
  });

  it('does not match keyword substrings', () => {
    const result = resolveTaskTags({ title: 'Review eventual superuser socializing partnerstacking' });

    expect(result.resolved_tags).toEqual([]);
  });

  it('canonicalizes legacy manual aliases without rewriting them', () => {
    const result = resolveTaskTags({ manualTags: ['trip', 'ICP', 'doc', 'read', 'bespoke'] });

    expect(result.resolved_tags.map(tag => [tag.key, tag.label, tag.emoji])).toEqual([
      ['content', 'Content', '✍️'],
      ['customers', 'Customers', '👥'],
      ['travel', 'Travel', '✈️'],
      ['manual:bespoke', 'bespoke', null],
    ]);
    expect(result.resolved_tags.find(tag => tag.key === 'content')?.matched_terms).toEqual(['doc', 'read']);
    expect(canonicalManualTaskTagKey('trip')).toBe('travel');
    expect(canonicalManualTaskTagKey('Read')).toBe('content');
  });

  it('deduplicates manual, direct, and inherited context while prioritizing local matches', () => {
    const result = resolveTaskTags({
      title: 'Plan a trip',
      parentTitle: 'Bruin launch',
      manualTags: ['trip'],
    });

    expect(result.resolved_tags.map(tag => tag.key)).toEqual(['travel', 'data-stack', 'growth']);
    expect(result.resolved_tags[0]).toMatchObject({
      sources: ['manual', 'title'],
      matched_terms: ['trip'],
    });
    expect(result.detected_tags.map(tag => tag.key)).toEqual(['travel', 'data-stack', 'growth']);
    expect(result.detected_tags[1].sources).toEqual(['parent']);
  });

  it('limits dense rows to two emoji-backed tags and reports the overflow', () => {
    const result = resolveTaskTags({
      title: 'Bruin blog launch community partner customer trip Vodafone',
      manualTags: ['bespoke'],
    });

    const emojiTags = emojiTaskTags(result.resolved_tags);
    expect(emojiTags).toHaveLength(8);
    expect(visibleEmojiTaskTags(result.resolved_tags).map(tag => tag.key)).toEqual(['data-stack', 'content']);
    expect(hiddenEmojiTaskTagCount(result.resolved_tags)).toBe(6);
  });
});

describe('hashtag parsing compatibility', () => {
  it('keeps explicit hashtags manual and preserves priority parsing', () => {
    const parsed = parseHashtags('Read the docs #doc #read #focus');

    expect(parsed).toMatchObject({
      title: 'Read the docs',
      tags: ['doc', 'read'],
      priority: 2,
    });
  });
});
