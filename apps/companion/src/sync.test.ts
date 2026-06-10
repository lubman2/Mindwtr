import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { openState } from './state.js';
import { runGmailSync } from './sync.js';
import { serializeCursor, type FetchResult, type GmailMessage } from './connectors/gmail.js';

const gmailConfig = {
  enabled: true,
  host: 'h',
  port: 993,
  user: 'u',
  password: 'p',
  mailbox: 'INBOX',
  pollSeconds: 300,
};

const message = (uid: number, messageId: string | null): GmailMessage => ({
  uid,
  messageId,
  subject: `Mail ${uid}`,
  from: 'Jan <jan@example.com>',
  date: '2026-06-10T08:00:00.000Z',
});

const noopLog = { info: () => {}, error: () => {} };

const makeDeps = (fetchResult: FetchResult) => {
  const state = openState(join(mkdtempSync(join(tmpdir(), 'companion-sync-')), 'state.sqlite'));
  const added: Array<{ title: string }> = [];
  let counter = 0;
  return {
    state,
    added,
    deps: {
      fetchNewMessages: async () => fetchResult,
      addInboxTask: async (input: { title: string }) => {
        added.push(input);
        counter += 1;
        return { id: `task-${counter}` };
      },
      state,
      log: noopLog,
    },
  };
};

describe('runGmailSync', () => {
  test('imports new messages, records imports, saves cursor', async () => {
    const cursor = { uidValidity: '111', lastUid: 52 };
    const { deps, state, added } = makeDeps({
      messages: [message(51, '<m51@x>'), message(52, null)],
      cursor,
    });
    const result = await runGmailSync(gmailConfig, deps);
    expect(result).toEqual({ imported: 2, skipped: 0 });
    expect(added.map((a) => a.title)).toEqual(['Mail 51', 'Mail 52']);
    expect(state.hasImport('gmail', '<m51@x>')).toBe(true);
    expect(state.hasImport('gmail', '111:52')).toBe(true); // fallback ID bez messageId
    expect(state.getCursor('gmail')).toBe(serializeCursor(cursor));
    state.close();
  });

  test('already imported messages are skipped', async () => {
    const cursor = { uidValidity: '111', lastUid: 51 };
    const { deps, state, added } = makeDeps({ messages: [message(51, '<m51@x>')], cursor });
    state.recordImport('gmail', '<m51@x>', 'task-existing');
    const result = await runGmailSync(gmailConfig, deps);
    expect(result).toEqual({ imported: 0, skipped: 1 });
    expect(added).toEqual([]);
    state.close();
  });

  test('failure while adding task leaves cursor untouched', async () => {
    const cursor = { uidValidity: '111', lastUid: 51 };
    const { deps, state } = makeDeps({ messages: [message(51, '<m51@x>')], cursor });
    deps.addInboxTask = async () => {
      throw new Error('db locked');
    };
    await expect(runGmailSync(gmailConfig, deps)).rejects.toThrow('db locked');
    expect(state.getCursor('gmail')).toBeNull();
    state.close();
  });
});
