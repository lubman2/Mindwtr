import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { Database } from 'bun:sqlite';

import { openMindwtr } from './mindwtr.js';

describe('openMindwtr', () => {
  test('throws when database file does not exist', async () => {
    await expect(openMindwtr('/nonexistent/mindwtr.db')).rejects.toThrow('not found');
  });

  test('addInboxTask creates inbox task persisted in sqlite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'companion-mindwtr-'));
    const dbPath = join(dir, 'mindwtr.db');
    writeFileSync(dbPath, ''); // prázdný soubor = validní nová sqlite DB
    const client = await openMindwtr(dbPath);
    try {
      const task = await client.addInboxTask({
        title: 'Zaplatit fakturu',
        description: 'Od: Jan <jan@example.com>',
        tags: ['gmail'],
      });
      expect(task.id).toBeTruthy();
      expect(task.status).toBe('inbox');
      expect(task.title).toBe('Zaplatit fakturu');
      expect(task.tags).toEqual(['gmail']);

      const raw = new Database(dbPath, { readonly: true });
      const row = raw.prepare('SELECT id FROM tasks WHERE id = ?').get(task.id);
      raw.close();
      expect(row).not.toBeNull();
    } finally {
      client.close();
    }
  });
});
