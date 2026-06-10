import { ImapFlow } from 'imapflow';

import type { GmailConfig } from '../config.js';

export type GmailMessage = {
  uid: number;
  messageId: string | null;
  subject: string;
  from: string;
  date: string | null;
};

export type GmailCursor = {
  uidValidity: string;
  lastUid: number;
};

export type NewTaskInput = {
  title: string;
  description: string;
  tags: string[];
};

// Mindwtr core nevynucuje délku titulku; drž stejný limit jako mcp-server (MAX_TASK_TITLE_LENGTH).
const MAX_TITLE_LENGTH = 500;

export function serializeCursor(cursor: GmailCursor): string {
  return JSON.stringify(cursor);
}

export function parseCursor(raw: string | null): GmailCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.uidValidity === 'string' &&
      typeof parsed.lastUid === 'number' &&
      Number.isInteger(parsed.lastUid) &&
      parsed.lastUid >= 0
    ) {
      return { uidValidity: parsed.uidValidity, lastUid: parsed.lastUid };
    }
    return null;
  } catch {
    return null;
  }
}

export function mapMessageToTask(msg: GmailMessage): NewTaskInput {
  const title = (msg.subject.trim() || '(bez předmětu)').slice(0, MAX_TITLE_LENGTH);
  const lines = [`Od: ${msg.from}`];
  if (msg.date) lines.push(`Datum: ${msg.date}`);
  if (msg.messageId) {
    const bareId = msg.messageId.replace(/^<|>$/g, '');
    lines.push(
      `Gmail: https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(bareId)}`,
    );
  }
  return { title, description: lines.join('\n'), tags: ['gmail'] };
}

export function externalIdFor(msg: GmailMessage, uidValidity: string): string {
  return msg.messageId ?? `${uidValidity}:${msg.uid}`;
}

export type ImapEnvelope = {
  messageId?: string;
  subject?: string;
  date?: Date;
  from?: Array<{ name?: string; address?: string }>;
};

export type ImapFetchedMessage = {
  uid: number;
  envelope: ImapEnvelope;
};

export type ImapClientLike = {
  connect: () => Promise<void>;
  getMailboxLock: (mailbox: string) => Promise<{ release: () => void }>;
  mailbox: { uidValidity: bigint; uidNext: number } | boolean;
  fetch: (
    range: { uid: string },
    options: { envelope: boolean; uid: boolean },
  ) => AsyncIterable<ImapFetchedMessage>;
  logout: () => Promise<void>;
};

export type ImapClientFactory = (config: GmailConfig) => ImapClientLike;

const defaultImapClientFactory: ImapClientFactory = (config) =>
  new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false,
  }) as unknown as ImapClientLike;

const formatFrom = (from: ImapEnvelope['from']): string => {
  const first = from?.[0];
  if (!first) return '(neznámý odesílatel)';
  const name = first.name?.trim();
  const address = first.address?.trim();
  if (name && address) return `${name} <${address}>`;
  return address || name || '(neznámý odesílatel)';
};

export type FetchResult = {
  messages: GmailMessage[];
  cursor: GmailCursor;
};

export async function fetchNewMessages(
  config: GmailConfig,
  cursor: GmailCursor | null,
  createClient: ImapClientFactory = defaultImapClientFactory,
): Promise<FetchResult> {
  const client = createClient(config);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      const mailbox = client.mailbox;
      if (typeof mailbox === 'boolean') {
        throw new Error(`Mailbox not selected: ${config.mailbox}`);
      }
      const uidValidity = String(mailbox.uidValidity);

      // První běh nebo reset UIDVALIDITY: jen nastavit baseline, nic neimportovat.
      if (!cursor || cursor.uidValidity !== uidValidity) {
        return { messages: [], cursor: { uidValidity, lastUid: mailbox.uidNext - 1 } };
      }

      const messages: GmailMessage[] = [];
      let lastUid = cursor.lastUid;
      for await (const item of client.fetch(
        { uid: `${cursor.lastUid + 1}:*` },
        { envelope: true, uid: true },
      )) {
        // IMAP pro range "N:*" vrátí poslední zprávu i když nic nového není.
        if (item.uid <= cursor.lastUid) continue;
        messages.push({
          uid: item.uid,
          messageId: item.envelope.messageId ?? null,
          subject: item.envelope.subject ?? '',
          from: formatFrom(item.envelope.from),
          date: item.envelope.date ? item.envelope.date.toISOString() : null,
        });
        lastUid = Math.max(lastUid, item.uid);
      }
      messages.sort((a, b) => a.uid - b.uid);
      return { messages, cursor: { uidValidity, lastUid } };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
