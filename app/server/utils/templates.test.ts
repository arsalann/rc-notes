import { describe, expect, it } from 'vitest';
import { normalizeTemplateInput } from './templates';

describe('normalizeTemplateInput', () => {
  it('keeps only the fields that were sent', () => {
    expect(normalizeTemplateInput({ name: ' Weekly review ' })).toEqual({ name: 'Weekly review' });
  });

  it('cleans subtasks: drops blank titles, validates priority, dedupes tags', () => {
    const out = normalizeTemplateInput({
      subtasks: [
        { title: ' Plan ', priority: 3, tags: ['a', 'a', ' ', 5] },
        { title: '   ' },
        { title: 'Ship', priority: 7 },
        'nonsense',
      ],
    });
    expect(out.subtasks).toEqual([
      { title: 'Plan', description: '', priority: 3, tags: ['a'] },
      { title: 'Ship', description: '', priority: null, tags: [] },
    ]);
  });

  it('defaults an invalid task priority to Focus and treats empty workspace as none', () => {
    expect(normalizeTemplateInput({ priority: 'x', workspace_id: '' })).toEqual({ priority: 2, workspace_id: null });
    expect(normalizeTemplateInput({ priority: 0 })).toEqual({ priority: 0 });
  });
});
