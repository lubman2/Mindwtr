import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { loadConfig } from './config.js';

const writeToml = (content: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'companion-config-'));
  const path = join(dir, 'config.toml');
  writeFileSync(path, content);
  return path;
};

describe('loadConfig', () => {
  test('parses minimal gmail config and applies defaults', () => {
    const path = writeToml(`
[gmail]
user = "capture@gmail.com"
password = "abcd efgh ijkl mnop"
`);
    const config = loadConfig(path);
    expect(config.gmail?.user).toBe('capture@gmail.com');
    expect(config.gmail?.host).toBe('imap.gmail.com');
    expect(config.gmail?.port).toBe(993);
    expect(config.gmail?.mailbox).toBe('INBOX');
    expect(config.gmail?.pollSeconds).toBe(300);
    expect(config.gmail?.enabled).toBe(true);
    expect(config.mindwtr.dbPath.endsWith('mindwtr.db')).toBe(true);
    expect(config.state.path.endsWith('state.sqlite')).toBe(true);
  });

  test('config without [gmail] section is valid, gmail is undefined', () => {
    const path = writeToml('');
    const config = loadConfig(path);
    expect(config.gmail).toBeUndefined();
  });

  test('gmail section without user throws', () => {
    const path = writeToml(`
[gmail]
password = "x"
`);
    expect(() => loadConfig(path)).toThrow();
  });

  test('missing file throws', () => {
    expect(() => loadConfig('/nonexistent/config.toml')).toThrow();
  });
});
