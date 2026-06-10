import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { createLogger } from './logger.js';

describe('createLogger', () => {
  test('appends JSONL entries to companion.log', () => {
    const dir = mkdtempSync(join(tmpdir(), 'companion-log-'));
    const log = createLogger(dir);
    log.info('hello', { a: 1 });
    log.error('boom');
    const lines = readFileSync(join(dir, 'companion.log'), 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    const first = JSON.parse(lines[0]);
    expect(first.level).toBe('info');
    expect(first.message).toBe('hello');
    expect(first.context).toEqual({ a: 1 });
    expect(typeof first.ts).toBe('string');
    const second = JSON.parse(lines[1]);
    expect(second.level).toBe('error');
    expect(second.context).toBeUndefined();
  });
});
