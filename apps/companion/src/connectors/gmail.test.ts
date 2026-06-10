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
