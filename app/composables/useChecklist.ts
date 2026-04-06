export interface ChecklistItem {
  title: string;
  checked: boolean;
  indent: number;
  children: ChecklistItem[];
}

const CHECKLIST_RE = /^(\s*)- \[([ xX])\] (.+)$/;

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
 * Root tasks become @[Title], subtask lines are removed
 * (they show as subtasks inside the InlineTask embed).
 */
export function replaceChecklistWithMentions(
  content: string,
  rootTitles: string[]
): string {
  const titleSet = new Set(rootTitles);
  const lines = content.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const match = line.match(CHECKLIST_RE);
    if (match) {
      const title = match[3].trim();
      if (titleSet.has(title)) {
        // Root item — replace with @-mention
        result.push(`@[${title}]`);
        titleSet.delete(title);
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
