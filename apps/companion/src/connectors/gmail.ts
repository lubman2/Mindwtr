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
