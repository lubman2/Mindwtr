import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { openState } from './state.js';

const tmpStatePath = (): string =>
  join(mkdtempSync(join(tmpdir(), 'companion-state-')), 'nested', 'state.sqlite');

describe('openState', () => {
  test('records and detects imports per connector', () => {
    const state = openState(tmpStatePath());
    expect(state.hasImport('gmail', 'msg-1')).toBe(false);
    state.recordImport('gmail', 'msg-1', 'task-a');
    expect(state.hasImport('gmail', 'msg-1')).toBe(true);
    expect(state.hasImport('eway', 'msg-1')).toBe(false);
    // opakovaný záznam stejného ID nesmí spadnout
    state.recordImport('gmail', 'msg-1', 'task-b');
    state.close();
  });

  test('cursor get/set roundtrip with upsert', () => {
    const state = openState(tmpStatePath());
    expect(state.getCursor('gmail')).toBeNull();
    state.setCursor('gmail', 'v1');
    expect(state.getCursor('gmail')).toBe('v1');
    state.setCursor('gmail', 'v2');
    expect(state.getCursor('gmail')).toBe('v2');
    state.close();
  });

  test('state persists across reopen', () => {
    const path = tmpStatePath();
    const first = openState(path);
    first.recordImport('gmail', 'msg-9', 'task-z');
    first.setCursor('gmail', 'cur');
    first.close();
    const second = openState(path);
    expect(second.hasImport('gmail', 'msg-9')).toBe(true);
    expect(second.getCursor('gmail')).toBe('cur');
    second.close();
  });
});
