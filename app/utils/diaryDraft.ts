export const DIARY_DRAFT_VERSION = 2 as const;
export const DIARY_DRAFT_KEY_PREFIX = `daybook:diary-draft:v${DIARY_DRAFT_VERSION}`;
export const LEGACY_DIARY_DRAFT_KEY_PREFIX = 'daybook:diary-draft:';

export interface DiaryDraftIdentity {
  userId: string;
  entryId: string;
  date: string;
  workspaceId: string | null;
}

export interface DiaryDraft {
  version: typeof DIARY_DRAFT_VERSION;
  identity: DiaryDraftIdentity;
  content: string;
  savedAt: string;
  baseUpdatedAt: string;
}

export type DiaryDraftInspection =
  | { status: 'accepted'; draft: DiaryDraft }
  | { status: 'missing' | 'invalid' | 'legacy' | 'context-mismatch' | 'stale-base' };

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isDiaryDraftIdentity(value: unknown): value is DiaryDraftIdentity {
  if (!value || typeof value !== 'object') return false;
  const identity = value as Partial<DiaryDraftIdentity>;
  return hasText(identity.userId)
    && hasText(identity.entryId)
    && /^\d{4}-\d{2}-\d{2}$/.test(identity.date || '')
    && (identity.workspaceId === null || hasText(identity.workspaceId));
}

function isDiaryDraft(value: unknown): value is DiaryDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<DiaryDraft>;
  return draft.version === DIARY_DRAFT_VERSION
    && isDiaryDraftIdentity(draft.identity)
    && typeof draft.content === 'string'
    && hasText(draft.savedAt)
    && hasText(draft.baseUpdatedAt);
}

export function sameDiaryDraftIdentity(left: DiaryDraftIdentity, right: DiaryDraftIdentity): boolean {
  return left.userId === right.userId
    && left.entryId === right.entryId
    && left.date === right.date
    && left.workspaceId === right.workspaceId;
}

export function diaryDraftStorageKey(identity: DiaryDraftIdentity): string {
  const parts = [identity.userId, identity.entryId, identity.workspaceId ?? '{none}', identity.date]
    .map(part => encodeURIComponent(part));
  return `${DIARY_DRAFT_KEY_PREFIX}:${parts.join(':')}`;
}

export function isLegacyDiaryDraftKey(storageKey: string): boolean {
  return storageKey.startsWith(LEGACY_DIARY_DRAFT_KEY_PREFIX)
    && !storageKey.startsWith(`${DIARY_DRAFT_KEY_PREFIX}:`);
}

export function diaryDraftQuarantineKey(storageKey: string, quarantinedAt: string): string {
  return `${storageKey}:quarantine:${encodeURIComponent(quarantinedAt)}`;
}

export function createDiaryDraft(
  identity: DiaryDraftIdentity,
  content: string,
  baseUpdatedAt: string,
  savedAt = new Date().toISOString(),
): DiaryDraft {
  return {
    version: DIARY_DRAFT_VERSION,
    identity: { ...identity },
    content,
    savedAt,
    baseUpdatedAt,
  };
}

export function inspectDiaryDraft(
  raw: string | null,
  expectedIdentity: DiaryDraftIdentity,
  serverUpdatedAt: string,
): DiaryDraftInspection {
  if (!raw) return { status: 'missing' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid' };
  }

  if (parsed && typeof parsed === 'object' && (parsed as { version?: unknown }).version !== DIARY_DRAFT_VERSION) {
    return { status: 'legacy' };
  }
  if (!isDiaryDraft(parsed)) return { status: 'invalid' };
  if (!sameDiaryDraftIdentity(parsed.identity, expectedIdentity)) return { status: 'context-mismatch' };
  if (parsed.baseUpdatedAt !== serverUpdatedAt) return { status: 'stale-base' };

  return { status: 'accepted', draft: parsed };
}

export function canPersistDiaryDraft(
  draft: DiaryDraft,
  currentIdentity: DiaryDraftIdentity,
  serverUpdatedAt: string,
): boolean {
  return sameDiaryDraftIdentity(draft.identity, currentIdentity)
    && draft.baseUpdatedAt === serverUpdatedAt;
}
