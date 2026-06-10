import { describe, expect, test } from 'bun:test';

import {
  externalIdFor,
  mapMessageToTask,
  parseCursor,
  serializeCursor,
  type GmailMessage,
} from './gmail.js';

describe('cursor serialization', () => {
  test('roundtrip', () => {
    const cursor = { uidValidity: '12345', lastUid: 99 };
    expect(parseCursor(serializeCursor(cursor))).toEqual(cursor);
  });

  test('invalid input returns null', () => {
    expect(parseCursor(null)).toBeNull();
    expect(parseCursor('')).toBeNull();
    expect(parseCursor('not-json')).toBeNull();
    expect(parseCursor('{"uidValidity":"x"}')).toBeNull();
    expect(parseCursor('{"uidValidity":"x","lastUid":1.5}')).toBeNull();
    expect(parseCursor('{"uidValidity":"x","lastUid":-1}')).toBeNull();
  });
});

describe('mapMessageToTask', () => {
  const msg: GmailMessage = {
    uid: 7,
    messageId: '<abc@mail.gmail.com>',
    subject: 'Zaplatit fakturu',
    from: 'Jan Novák <jan@example.com>',
    date: '2026-06-10T08:00:00.000Z',
  };

  test('maps subject to title, builds description with from/date/link', () => {
    const task = mapMessageToTask(msg);
    expect(task.title).toBe('Zaplatit fakturu');
    expect(task.tags).toEqual(['gmail']);
    expect(task.description).toContain('Od: Jan Novák <jan@example.com>');
    expect(task.description).toContain('Datum: 2026-06-10T08:00:00.000Z');
    expect(task.description).toContain(
      'https://mail.google.com/mail/u/0/#search/rfc822msgid:abc%40mail.gmail.com',
    );
  });

  test('empty subject falls back', () => {
    expect(mapMessageToTask({ ...msg, subject: '  ' }).title).toBe('(bez předmětu)');
  });

  test('very long subject is clamped to 500 chars', () => {
    const task = mapMessageToTask({ ...msg, subject: 'x'.repeat(600) });
    expect(task.title.length).toBe(500);
  });

  test('missing messageId and date omit lines', () => {
    const task = mapMessageToTask({ ...msg, messageId: null, date: null });
    expect(task.description).not.toContain('Datum:');
    expect(task.description).not.toContain('rfc822msgid');
  });
});

describe('externalIdFor', () => {
  test('prefers messageId, falls back to uidValidity:uid', () => {
    const msg: GmailMessage = { uid: 7, messageId: '<x@y>', subject: 's', from: 'f', date: null };
    expect(externalIdFor(msg, '123')).toBe('<x@y>');
    expect(externalIdFor({ ...msg, messageId: null }, '123')).toBe('123:7');
  });
});

import { fetchNewMessages, type ImapClientFactory, type ImapEnvelope } from './gmail.js';

const makeFakeFactory = (opts: {
  uidValidity: bigint;
  uidNext: number;
  messages: Array<{ uid: number; envelope: ImapEnvelope }>;
}): ImapClientFactory => {
  return () => ({
    connect: async () => {},
    getMailboxLock: async () => ({ release: () => {} }),
    mailbox: { uidValidity: opts.uidValidity, uidNext: opts.uidNext },
    fetch: (range: { uid: string }) => {
      const fromUid = Number(range.uid.split(':')[0]);
      const matched = opts.messages.filter((m) => m.uid >= fromUid);
      // IMAP vrací pro range "N:*" minimálně poslední zprávu, i když je N > maxUid
      const result = matched.length ? matched : opts.messages.slice(-1);
      return (async function* () {
        for (const m of result) yield m;
      })();
    },
    logout: async () => {},
  });
};

const gmailConfig = {
  enabled: true,
  host: 'imap.example.com',
  port: 993,
  user: 'u',
  password: 'p',
  mailbox: 'INBOX',
  pollSeconds: 300,
};

describe('fetchNewMessages', () => {
  const envelope = (n: number): ImapEnvelope => ({
    messageId: `<m${n}@x>`,
    subject: `Subject ${n}`,
    date: new Date('2026-06-10T08:00:00Z'),
    from: [{ name: 'Jan', address: 'jan@example.com' }],
  });

  test('no cursor: returns no messages, baseline cursor at uidNext-1', async () => {
    const factory = makeFakeFactory({
      uidValidity: 111n,
      uidNext: 51,
      messages: [{ uid: 50, envelope: envelope(50) }],
    });
    const result = await fetchNewMessages(gmailConfig, null, factory);
    expect(result.messages).toEqual([]);
    expect(result.cursor).toEqual({ uidValidity: '111', lastUid: 50 });
  });

  test('uidValidity change: resets baseline without importing', async () => {
    const factory = makeFakeFactory({
      uidValidity: 222n,
      uidNext: 11,
      messages: [{ uid: 10, envelope: envelope(10) }],
    });
    const result = await fetchNewMessages(
      gmailConfig,
      { uidValidity: '111', lastUid: 50 },
      factory,
    );
    expect(result.messages).toEqual([]);
    expect(result.cursor).toEqual({ uidValidity: '222', lastUid: 10 });
  });

  test('returns only messages above lastUid and advances cursor', async () => {
    const factory = makeFakeFactory({
      uidValidity: 111n,
      uidNext: 53,
      messages: [
        { uid: 50, envelope: envelope(50) },
        { uid: 51, envelope: envelope(51) },
        { uid: 52, envelope: envelope(52) },
      ],
    });
    const result = await fetchNewMessages(
      gmailConfig,
      { uidValidity: '111', lastUid: 50 },
      factory,
    );
    expect(result.messages.map((m) => m.uid)).toEqual([51, 52]);
    expect(result.messages[0].subject).toBe('Subject 51');
    expect(result.messages[0].from).toBe('Jan <jan@example.com>');
    expect(result.messages[0].messageId).toBe('<m51@x>');
    expect(result.cursor).toEqual({ uidValidity: '111', lastUid: 52 });
  });

  test('no new messages: IMAP echoes last message, gets filtered out', async () => {
    const factory = makeFakeFactory({
      uidValidity: 111n,
      uidNext: 51,
      messages: [{ uid: 50, envelope: envelope(50) }],
    });
    const result = await fetchNewMessages(
      gmailConfig,
      { uidValidity: '111', lastUid: 50 },
      factory,
    );
    expect(result.messages).toEqual([]);
    expect(result.cursor).toEqual({ uidValidity: '111', lastUid: 50 });
  });
});
