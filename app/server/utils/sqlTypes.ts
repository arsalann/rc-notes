/**
 * Parameter type hints for `queryAll` / `execute` (`{ name: VARCHAR }`, a holdover from the DuckDB
 * driver). Each hinted placeholder gets an explicit cast (`$1::varchar`), so Postgres never has to
 * guess a parameter's type from context. Unhinted parameters are left to Postgres inference.
 * A VARCHAR value bound for a DATE/TIMESTAMP column still needs an explicit cast in the SQL
 * (`$due_at::TIMESTAMP`), as before.
 */
export type SqlType = { sql: string };

export const VARCHAR: SqlType = { sql: 'varchar' };
export const BOOLEAN: SqlType = { sql: 'boolean' };
export const INTEGER: SqlType = { sql: 'integer' };
export const BIGINT: SqlType = { sql: 'bigint' };

export function LIST(element: SqlType): SqlType {
  return { sql: `${element.sql}[]` };
}

/** Arrays are sent as plain JS arrays; kept so call sites read the same as before. */
export function listValue<T>(values: T[]): T[] {
  return values;
}
