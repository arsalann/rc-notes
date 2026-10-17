import { describe, expect, it } from 'vitest';
import { toPositional } from './sql';
import { LIST, VARCHAR } from './sqlTypes';

describe('toPositional', () => {
  it('numbers parameters in order and reuses repeated names', () => {
    const { text, values } = toPositional(
      'SELECT * FROM t WHERE a = $a AND b = $b OR a2 = $a',
      { a: 1, b: 'x' },
    );
    expect(text).toBe('SELECT * FROM t WHERE a = $1 AND b = $2 OR a2 = $1');
    expect(values).toEqual([1, 'x']);
  });

  it('leaves casts, strings, identifiers and comments alone', () => {
    const { text, values } = toPositional(
      `SELECT '$notparam', "$col", $d::DATE -- $comment\nFROM t WHERE x = 'it''s $x'`,
      { d: '2026-10-17' },
    );
    expect(text).toBe(`SELECT '$notparam', "$col", $1::DATE -- $comment\nFROM t WHERE x = 'it''s $x'`);
    expect(values).toEqual(['2026-10-17']);
  });

  it('casts hinted parameters, including lists for ANY() and unnest()', () => {
    const { text } = toPositional('WHERE id = ANY($ids) AND name = $n', { ids: ['a'], n: 'b' }, { ids: LIST(VARCHAR), n: VARCHAR });
    expect(text).toBe('WHERE id = ANY($1::varchar[]) AND name = $2::varchar');
  });

  it('sends undefined as null and rejects missing parameters', () => {
    expect(toPositional('SELECT $a', { a: undefined }).values).toEqual([null]);
    expect(() => toPositional('SELECT $missing', {})).toThrow(/missing/);
  });

  it('ignores positional placeholders that are already numbered', () => {
    expect(toPositional('SELECT $1', {}).text).toBe('SELECT $1');
  });
});
