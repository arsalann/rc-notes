export interface ChecklistItem {
  title: string;
  checked: boolean;
  indent: number;
  children: ChecklistItem[];
}

const CHECKLIST_RE = /^(\s*)- \[([ xX])\] (.+)$/m;

/**
 * Parse markdown content and extract checklist items as a tree.
 * Indented items become children of the nearest less-indented item above them.
 */
export function parseChecklist(content: string): ChecklistItem[] {
  const lines = content.split('\n');
  const roots: ChecklistItem[] = [];
  const stack: { item: ChecklistItem; indent: number }[] = [];

  for (const line of lines) {
    const match = line.match(CHECKLIST_RE);
    if (!match) continue;

    const indent = match[1].length;
    const checked = match[2].toLowerCase() === 'x';
    const title = match[3].trim();

    const item: ChecklistItem = { title, checked, indent, children: [] };

    // Pop stack until we find a parent with less indentation
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(item);
    } else {
      stack[stack.length - 1].item.children.push(item);
    }

    stack.push({ item, indent });
  }

  return roots;
}

/**
 * Check if markdown content contains any checklist items.
 */
export function hasChecklist(content: string): boolean {
  return CHECKLIST_RE.test(content);
}

/**
 * Replace checklist items in content with @-mention references.
 * Root tasks become @[cleanTitle], subtask lines are removed.
 * Accepts either a string[] of titles (original == clean) or
 * a list of {original, clean} pairs so the mention can use a
 * hashtag-stripped title even when the source line still holds
 * the raw hashtags.
 */
export function replaceChecklistWithMentions(
  content: string,
  rootTitles: Array<string | { original: string; clean: string }>
): string {
  const pairs = rootTitles.map(t => typeof t === 'string' ? { original: t, clean: t } : t);
  const map = new Map(pairs.map(p => [p.original, p.clean]));
  const remaining = new Set(pairs.map(p => p.original));
  const lines = content.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const match = line.match(CHECKLIST_RE);
    if (match) {
      const title = match[3].trim();
      if (remaining.has(title)) {
        result.push(`@[${map.get(title)}]`);
        remaining.delete(title);
      }
      // Subtask lines are dropped (visible inside InlineTask)
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

export function useChecklist() {
  return { parseChecklist, hasChecklist, replaceChecklistWithMentions };
}
