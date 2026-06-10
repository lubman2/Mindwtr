import { mkdirSync } from 'fs';
import { dirname } from 'path';

import { Database } from 'bun:sqlite';

export type CompanionState = {
  hasImport: (connector: string, externalId: string) => boolean;
  recordImport: (connector: string, externalId: string, taskId: string) => void;
  getCursor: (connector: string) => string | null;
  setCursor: (connector: string, value: string) => void;
  close: () => void;
};

export function openState(path: string): CompanionState {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS imports (
      connector TEXT NOT NULL,
      external_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      PRIMARY KEY (connector, external_id)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cursors (
      connector TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return {
    hasImport: (connector, externalId) =>
      db
        .prepare('SELECT 1 AS hit FROM imports WHERE connector = ? AND external_id = ?')
        .get(connector, externalId) !== null,
    recordImport: (connector, externalId, taskId) => {
      db.prepare(
        'INSERT OR IGNORE INTO imports (connector, external_id, task_id, imported_at) VALUES (?, ?, ?, ?)',
      ).run(connector, externalId, taskId, new Date().toISOString());
    },
    getCursor: (connector) => {
      const row = db.prepare('SELECT value FROM cursors WHERE connector = ?').get(connector) as
        | { value: string }
        | null;
      return row ? row.value : null;
    },
    setCursor: (connector, value) => {
      db.prepare(
        'INSERT INTO cursors (connector, value) VALUES (?, ?) ON CONFLICT(connector) DO UPDATE SET value = excluded.value',
      ).run(connector, value);
    },
    close: () => db.close(),
  };
}
