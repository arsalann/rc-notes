import { describe, expect, it } from 'vitest';
import {
  createDiaryDraft,
  diaryDraftQuarantineKey,
  diaryDraftStorageKey,
  isLegacyDiaryDraftKey,
  inspectDiaryDraft,
  canPersistDiaryDraft,
  type DiaryDraftIdentity,
} from './diaryDraft';

const september14: DiaryDraftIdentity = {
  userId: 'user-1',
  entryId: 'entry-sep-14',
  date: '2026-09-14',
  workspaceId: 'workspace-work',
};

const september15: DiaryDraftIdentity = {
  ...september14,
  entryId: 'entry-sep-15',
  date: '2026-09-15',
};

const serverUpdatedAt = '2026-09-14T12:00:00.000Z';

describe('diary draft identity', () => {
  it('creates a versioned key bound to user, entry, workspace, and date', () => {
    const key = diaryDraftStorageKey(september14);

    expect(key).toBe('daybook:diary-draft:v2:user-1:entry-sep-14:workspace-work:2026-09-14');
    expect(diaryDraftStorageKey(september15)).not.toBe(key);
    expect(diaryDraftStorageKey({ ...september14, workspaceId: 'workspace-personal' })).not.toBe(key);
    expect(diaryDraftStorageKey({ ...september14, workspaceId: null }))
      .toBe('daybook:diary-draft:v2:user-1:entry-sep-14:%7Bnone%7D:2026-09-14');
  });

  it('keeps a source-day draft isolated when navigation changes the destination day', () => {
    const sourceDraft = createDiaryDraft(september14, 'September 14 notes', serverUpdatedAt);
    const inspected = inspectDiaryDraft(JSON.stringify(sourceDraft), september15, serverUpdatedAt);

    expect(inspected).toEqual({ status: 'context-mismatch' });
    expect(canPersistDiaryDraft(sourceDraft, september15, serverUpdatedAt)).toBe(false);
  });

  it('rejects a draft when only its entry id differs', () => {
    const draft = createDiaryDraft(september14, 'September 14 notes', serverUpdatedAt);
    const wrongEntry = { ...september14, entryId: 'another-entry-for-the-same-day' };

    expect(inspectDiaryDraft(JSON.stringify(draft), wrongEntry, serverUpdatedAt))
      .toEqual({ status: 'context-mismatch' });
  });
});

describe('diary draft recovery safeguards', () => {
  it('accepts a current draft only in its exact unchanged server context', () => {
    const draft = createDiaryDraft(
      september14,
      'Unsaved addition',
      serverUpdatedAt,
      '2026-09-14T12:05:00.000Z',
    );

    expect(inspectDiaryDraft(JSON.stringify(draft), september14, serverUpdatedAt))
      .toEqual({ status: 'accepted', draft });
    expect(canPersistDiaryDraft(draft, september14, serverUpdatedAt)).toBe(true);
  });

  it('rejects a draft based on an older server revision', () => {
    const draft = createDiaryDraft(september14, 'Old local edit', serverUpdatedAt);
    const newerServerUpdatedAt = '2026-09-14T12:10:00.000Z';

    expect(inspectDiaryDraft(JSON.stringify(draft), september14, newerServerUpdatedAt))
      .toEqual({ status: 'stale-base' });
    expect(canPersistDiaryDraft(draft, september14, newerServerUpdatedAt)).toBe(false);
  });

  it('rejects unversioned legacy drafts and gives them a separate quarantine key', () => {
    const legacy = JSON.stringify({
      content: 'Potentially misfiled notes',
      savedAt: '2026-09-14T12:05:00.000Z',
    });
    const legacyKey = 'daybook:diary-draft:user-1:workspace-work:2026-09-15';

    expect(inspectDiaryDraft(legacy, september15, serverUpdatedAt)).toEqual({ status: 'legacy' });
    expect(isLegacyDiaryDraftKey(legacyKey)).toBe(true);
    expect(isLegacyDiaryDraftKey(diaryDraftStorageKey(september15))).toBe(false);
    expect(diaryDraftQuarantineKey(legacyKey, '2026-09-17T09:30:00.000Z'))
      .toBe(`${legacyKey}:quarantine:2026-09-17T09%3A30%3A00.000Z`);
  });

  it.each([
    ['', 'missing'],
    ['not-json', 'invalid'],
    [JSON.stringify({ version: 2, content: 'missing identity' }), 'invalid'],
  ])('does not recover malformed storage (%s)', (raw, status) => {
    expect(inspectDiaryDraft(raw || null, september14, serverUpdatedAt)).toEqual({ status });
  });
});
