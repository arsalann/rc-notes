import type { SqlType } from './sqlTypes';

/**
 * Rewrites `$name` placeholders to Postgres positional `$1, $2, ...`. A name used twice maps to the
 * same position. Quoted strings, quoted identifiers and `--` comments are left untouched, and so is
 * the `::type` cast syntax. A type hint with a SQL type (lists) adds an explicit cast.
 */
export function toPositional(
  sql: string,
  params: Record<string, any> = {},
  types: Record<string, SqlType | undefined> = {},
): { text: string; values: any[] } {
  const positions = new Map<string, number>();
  const values: any[] = [];
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; } // doubled quote escape
          break;
        }
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const j = end === -1 ? sql.length : end;
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    if (ch === '$' && /[A-Za-z_]/.test(sql[i + 1] ?? '')) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j]!)) j++;
      const name = sql.slice(i + 1, j);
      if (!(name in params)) throw new Error(`SQL parameter $${name} has no value`);
      let pos = positions.get(name);
      if (pos === undefined) {
        values.push(params[name] === undefined ? null : params[name]);
        pos = values.length;
        positions.set(name, pos);
      }
      const cast = types[name]?.sql;
      out += cast ? `$${pos}::${cast}` : `$${pos}`;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return { text: out, values };
}
