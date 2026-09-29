// Client-side stub for server-only database and native modules
export default {
  Pool: class Pool {},
  Client: class Client {},
  types: { setTypeParser: () => {} },
};

export const DEFAULT_DATABASE_URL = '';
export function getConnectionString(): string {
  return '';
}
export const Pool = class Pool {};
export const Client = class Client {};
export const types = { setTypeParser: () => {} };
export function getPool(): unknown {
  return new Pool();
}
export async function closePool(): Promise<void> {}
export const SCHEMA_SQL = '';
export async function initDatabase(): Promise<void> {}
export async function query<T = unknown>(): Promise<{
  rows: T[];
  rowCount: number;
}> {
  return { rows: [], rowCount: 0 };
}
