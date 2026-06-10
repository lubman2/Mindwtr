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

export function serializeCursor(cursor: GmailCursor): string {
  return JSON.stringify(cursor);
}

export function parseCursor(raw: string | null): GmailCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.uidValidity === 'string' && typeof parsed.lastUid === 'number') {
      return { uidValidity: parsed.uidValidity, lastUid: parsed.lastUid };
    }
    return null;
  } catch {
    return null;
  }
}

export function mapMessageToTask(msg: GmailMessage): NewTaskInput {
  const title = msg.subject.trim() || '(bez předmětu)';
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
