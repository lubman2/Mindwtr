# Companion Skeleton + Gmail Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postavit `apps/companion` (Bun daemon nad lokální Mindwtr SQLite DB) a první konektor: import nových mailů z Gmail INBOXu jako tasky do Mindwtr inboxu.

**Architecture:** Companion je nová workspace app v monorepu na větvi `lubman`. K Mindwtr DB přistupuje přes `@mindwtr/core` (`SqliteAdapter` + `useTaskStore`) — stejný vzor jako `apps/mcp-server/src/core-adapter.ts`, ale Bun-only (`bun:sqlite`). Gmail konektor čte přes IMAP (imapflow, app password), kurzor = poslední UID v rámci UIDVALIDITY. Dedup a kurzory drží vlastní stavová SQLite (`~/.config/mindwtr-companion/state.sqlite`), protože core `Task` nemá volné metadata pole.

**Tech Stack:** Bun, TypeScript (strict), `@mindwtr/core` (workspace), `bun:sqlite`, `imapflow`, `smol-toml`, `zod`, `bun test`.

**Pozn. k bezpečnosti:** žádný kód v tomto plánu nepoužívá `child_process` — výskyty `.exec(...)` níže jsou výhradně SQLite API (`bun:sqlite` `Database.exec`), bez shellu a bez user inputu.

**Klíčová pravidla:**
- První běh neimportuje historii: bez kurzoru (nebo po změně UIDVALIDITY) se jen nastaví baseline na konec mailboxu.
- Companion do mailboxu NIKDY nezapisuje (read-only IMAP).
- Externí ID pro dedup = RFC Message-ID; fallback `uidValidity:uid`.
- Neměnit žádné root soubory repa (package.json, CI) — minimální merge plocha vůči upstreamu. Companion testy se pouští `bun --cwd apps/companion test`.

---

### Task 1: Scaffold apps/companion

**Files:**
- Create: `apps/companion/package.json`
- Create: `apps/companion/tsconfig.json`
- Create: `apps/companion/src/bun-sqlite.d.ts` (kopie z mcp-serveru)
- Create: `apps/companion/README.md`

- [ ] **Step 1: Vytvořit package.json**

```json
{
  "name": "mindwtr-companion",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "once": "bun src/index.ts --once",
    "start": "bun src/index.ts",
    "lint": "eslint -c ../../eslint.node.config.mjs . --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@mindwtr/core": "workspace:*",
    "imapflow": "^1.0.0",
    "smol-toml": "^1.4.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "~5.9.2"
  }
}
```

- [ ] **Step 2: Vytvořit tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Zkopírovat typovou deklaraci bun:sqlite**

Run: `cp apps/mcp-server/src/bun-sqlite.d.ts apps/companion/src/bun-sqlite.d.ts`

- [ ] **Step 4: Vytvořit README.md**

```markdown
# mindwtr-companion

Osobní background daemon nad lokální Mindwtr DB (větev `lubman`, není určeno pro upstream).

Konektory importují položky z externích zdrojů jako tasky do Mindwtr inboxu.
Stav (dedup, kurzory) drží vlastní SQLite v `~/.config/mindwtr-companion/state.sqlite`.

## Setup

1. `cp config.example.toml ~/.config/mindwtr-companion/config.toml` a vyplnit.
2. Gmail: na účtu zapnout 2FA a vytvořit App Password (https://myaccount.google.com/apppasswords).
3. Jednorázový běh: `bun run once` (první běh jen nastaví kurzor, nic neimportuje).
4. Trvalý běh: launchd agent — viz `launchd/`.

## Příkazy

- `bun run once` — jeden sync cyklus a konec
- `bun run start` — daemon (poll po `pollSeconds`)
- `bun test`, `bun run typecheck`, `bun run lint`
```

- [ ] **Step 5: Nainstalovat závislosti**

Run: `cd /Users/lubman/Sites/Mindwtr && bun install`
Expected: bez chyby; v `bun.lock` přibude `mindwtr-companion` workspace.

- [ ] **Step 6: Ověřit typecheck na prázdné app**

Run: `cd apps/companion && bunx tsc --noEmit`
Expected: PASS (žádné src soubory kromě d.ts → bez chyb)

- [ ] **Step 7: Commit**

```bash
git add apps/companion bun.lock
git commit -m "feat(companion): scaffold mindwtr-companion workspace app"
```

---

### Task 2: Config (`config.ts`)

**Files:**
- Create: `apps/companion/src/config.ts`
- Create: `apps/companion/src/config.test.ts`
- Create: `apps/companion/config.example.toml`

- [ ] **Step 1: Napsat failing test**

```typescript
// apps/companion/src/config.test.ts
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
```

- [ ] **Step 2: Spustit test — musí selhat**

Run: `cd apps/companion && bun test src/config.test.ts`
Expected: FAIL — `Cannot find module './config.js'`

- [ ] **Step 3: Implementovat config.ts**

```typescript
// apps/companion/src/config.ts
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import { parse } from 'smol-toml';
import * as z from 'zod';

const GmailConfigSchema = z.object({
  enabled: z.boolean().default(true),
  host: z.string().default('imap.gmail.com'),
  port: z.number().int().default(993),
  user: z.string().min(1),
  password: z.string().min(1),
  mailbox: z.string().default('INBOX'),
  pollSeconds: z.number().int().min(30).default(300),
});

const ConfigSchema = z.object({
  mindwtr: z
    .object({
      dbPath: z
        .string()
        .default(join(homedir(), 'Library', 'Application Support', 'mindwtr', 'mindwtr.db')),
    })
    .default({}),
  state: z
    .object({
      path: z.string().default(join(homedir(), '.config', 'mindwtr-companion', 'state.sqlite')),
    })
    .default({}),
  gmail: GmailConfigSchema.optional(),
});

export type CompanionConfig = z.infer<typeof ConfigSchema>;
export type GmailConfig = NonNullable<CompanionConfig['gmail']>;

export const defaultConfigPath = (): string =>
  process.env.MINDWTR_COMPANION_CONFIG ??
  join(homedir(), '.config', 'mindwtr-companion', 'config.toml');

export function loadConfig(path: string = defaultConfigPath()): CompanionConfig {
  const raw = readFileSync(path, 'utf8');
  return ConfigSchema.parse(parse(raw));
}
```

- [ ] **Step 4: Spustit test — musí projít**

Run: `cd apps/companion && bun test src/config.test.ts`
Expected: PASS (4 testy)

- [ ] **Step 5: Vytvořit config.example.toml**

```toml
# Zkopíruj do ~/.config/mindwtr-companion/config.toml a vyplň.
# Secrets NIKDY necommitovat.

# [mindwtr]
# dbPath = "/Users/lubman/Library/Application Support/mindwtr/mindwtr.db"

# [state]
# path = "/Users/lubman/.config/mindwtr-companion/state.sqlite"

[gmail]
user = "tvuj-capture-ucet@gmail.com"
password = "xxxx xxxx xxxx xxxx"   # Gmail App Password (vyžaduje 2FA)
# host = "imap.gmail.com"
# port = 993
# mailbox = "INBOX"
# pollSeconds = 300
# enabled = true
```

- [ ] **Step 6: Commit**

```bash
git add apps/companion/src/config.ts apps/companion/src/config.test.ts apps/companion/config.example.toml
git commit -m "feat(companion): TOML config loading with zod validation"
```

---

### Task 3: Logger (`logger.ts`)

**Files:**
- Create: `apps/companion/src/logger.ts`
- Create: `apps/companion/src/logger.test.ts`

- [ ] **Step 1: Napsat failing test**

```typescript
// apps/companion/src/logger.test.ts
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
```

- [ ] **Step 2: Spustit test — musí selhat**

Run: `cd apps/companion && bun test src/logger.test.ts`
Expected: FAIL — `Cannot find module './logger.js'`

- [ ] **Step 3: Implementovat logger.ts**

```typescript
// apps/companion/src/logger.ts
import { appendFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type Logger = {
  info: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
};

export const defaultLogDir = (): string => join(homedir(), 'Library', 'Logs', 'mindwtr-companion');

export function createLogger(dir: string = defaultLogDir()): Logger {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'companion.log');
  const write = (level: 'info' | 'error', message: string, context?: Record<string, unknown>) => {
    const line = `${JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...(context !== undefined ? { context } : {}),
    })}\n`;
    appendFileSync(file, line);
    process.stderr.write(line);
  };
  return {
    info: (message, context) => write('info', message, context),
    error: (message, context) => write('error', message, context),
  };
}

export const errorContext = (error: unknown): Record<string, unknown> => ({
  error: error instanceof Error ? error.message : String(error),
  ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
});
```

- [ ] **Step 4: Spustit test — musí projít**

Run: `cd apps/companion && bun test src/logger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/companion/src/logger.ts apps/companion/src/logger.test.ts
git commit -m "feat(companion): JSONL file logger"
```

---

### Task 4: Stavová DB (`state.ts`)

**Files:**
- Create: `apps/companion/src/state.ts`
- Create: `apps/companion/src/state.test.ts`

- [ ] **Step 1: Napsat failing test**

```typescript
// apps/companion/src/state.test.ts
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
```

- [ ] **Step 2: Spustit test — musí selhat**

Run: `cd apps/companion && bun test src/state.test.ts`
Expected: FAIL — `Cannot find module './state.js'`

- [ ] **Step 3: Implementovat state.ts**

Pozn.: `db.exec` níže je SQLite API z `bun:sqlite` (DDL na lokální soubor), nikoli `child_process`.

```typescript
// apps/companion/src/state.ts
import { mkdirSync } from 'fs';
import { dirname } from 'path';

import { Database } from 'bun:sqlite';

export type CompanionState = {
  hasImport: (connector: string, externalId: string) => boolean;
  recordImport: (connector: string, externalId: string, taskId: string) => void;
  getCursor: (connector: string) => string | null;
  setCursor: (connector: string, value: string) => void;
  close: () => void;
};

export function openState(path: string): CompanionState {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS imports (
      connector TEXT NOT NULL,
      external_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      PRIMARY KEY (connector, external_id)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cursors (
      connector TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return {
    hasImport: (connector, externalId) =>
      db
        .prepare('SELECT 1 AS hit FROM imports WHERE connector = ? AND external_id = ?')
        .get(connector, externalId) !== null,
    recordImport: (connector, externalId, taskId) => {
      db.prepare(
        'INSERT OR IGNORE INTO imports (connector, external_id, task_id, imported_at) VALUES (?, ?, ?, ?)',
      ).run(connector, externalId, taskId, new Date().toISOString());
    },
    getCursor: (connector) => {
      const row = db.prepare('SELECT value FROM cursors WHERE connector = ?').get(connector) as
        | { value: string }
        | null;
      return row ? row.value : null;
    },
    setCursor: (connector, value) => {
      db.prepare(
        'INSERT INTO cursors (connector, value) VALUES (?, ?) ON CONFLICT(connector) DO UPDATE SET value = excluded.value',
      ).run(connector, value);
    },
    close: () => db.close(),
  };
}
```

- [ ] **Step 4: Spustit test — musí projít**

Run: `cd apps/companion && bun test src/state.test.ts`
Expected: PASS (3 testy)

- [ ] **Step 5: Commit**

```bash
git add apps/companion/src/state.ts apps/companion/src/state.test.ts
git commit -m "feat(companion): sqlite state store for import dedup and cursors"
```

---

### Task 5: Gmail — kurzor a mapování zpráv (čisté funkce)

**Files:**
- Create: `apps/companion/src/connectors/gmail.ts`
- Create: `apps/companion/src/connectors/gmail.test.ts`

- [ ] **Step 1: Napsat failing test**

```typescript
// apps/companion/src/connectors/gmail.test.ts
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
```

- [ ] **Step 2: Spustit test — musí selhat**

Run: `cd apps/companion && bun test src/connectors/gmail.test.ts`
Expected: FAIL — `Cannot find module './gmail.js'`

- [ ] **Step 3: Implementovat čisté funkce v gmail.ts**

```typescript
// apps/companion/src/connectors/gmail.ts
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
    lines.push(`Gmail: https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(bareId)}`);
  }
  return { title, description: lines.join('\n'), tags: ['gmail'] };
}

export function externalIdFor(msg: GmailMessage, uidValidity: string): string {
  return msg.messageId ?? `${uidValidity}:${msg.uid}`;
}
```

- [ ] **Step 4: Spustit test — musí projít**

Run: `cd apps/companion && bun test src/connectors/gmail.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/companion/src/connectors/gmail.ts apps/companion/src/connectors/gmail.test.ts
git commit -m "feat(companion): gmail cursor and message-to-task mapping"
```

---

### Task 6: Gmail — fetchNewMessages přes IMAP (s fake klientem v testech)

**Files:**
- Modify: `apps/companion/src/connectors/gmail.ts` (přidat na konec souboru)
- Modify: `apps/companion/src/connectors/gmail.test.ts` (přidat describe blok)

- [ ] **Step 1: Přidat failing testy s fake IMAP klientem**

Přidat na konec `gmail.test.ts`:

```typescript
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
```

- [ ] **Step 2: Spustit test — musí selhat**

Run: `cd apps/companion && bun test src/connectors/gmail.test.ts`
Expected: FAIL — `fetchNewMessages` not exported

- [ ] **Step 3: Implementovat fetchNewMessages**

Přidat na konec `gmail.ts` (a import přesunout na začátek souboru):

```typescript
import { ImapFlow } from 'imapflow';

import type { GmailConfig } from '../config.js';

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
```

- [ ] **Step 4: Spustit testy — musí projít**

Run: `cd apps/companion && bun test src/connectors/gmail.test.ts`
Expected: PASS (všech 8 testů v souboru)

- [ ] **Step 5: Typecheck**

Run: `cd apps/companion && bunx tsc --noEmit`
Expected: PASS — imapflow dodává vlastní typy; cast přes `ImapClientLike` drží naše úzké rozhraní.

- [ ] **Step 6: Commit**

```bash
git add apps/companion/src/connectors/gmail.ts apps/companion/src/connectors/gmail.test.ts
git commit -m "feat(companion): IMAP fetch of new gmail messages with uid cursor"
```

---

### Task 7: Zápis do Mindwtr DB (`mindwtr.ts`)

**Files:**
- Create: `apps/companion/src/mindwtr.ts`
- Create: `apps/companion/src/mindwtr.test.ts`

Vzor: `apps/mcp-server/src/core-adapter.ts` (zjednodušený, Bun-only, jen addTask).
Pozor: `@mindwtr/core` má singleton store — `openMindwtr` volat v procesu jen jednou.

- [ ] **Step 1: Napsat failing test**

```typescript
// apps/companion/src/mindwtr.test.ts
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
```

- [ ] **Step 2: Spustit test — musí selhat**

Run: `cd apps/companion && bun test src/mindwtr.test.ts`
Expected: FAIL — `Cannot find module './mindwtr.js'`

- [ ] **Step 3: Implementovat mindwtr.ts**

Pozn.: `db.exec` níže je SQLite API z `bun:sqlite` (PRAGMA na lokální soubor), nikoli `child_process`.

```typescript
// apps/companion/src/mindwtr.ts
import { existsSync } from 'fs';

import {
  SqliteAdapter,
  createSerializedAsyncQueue,
  flushPendingSave,
  setStorageAdapter,
  useTaskStore,
  type Task,
} from '@mindwtr/core';

export type NewInboxTask = {
  title: string;
  description?: string;
  tags?: string[];
};

export type MindwtrClient = {
  addInboxTask: (input: NewInboxTask) => Promise<Task>;
  close: () => void;
};

export async function openMindwtr(dbPath: string): Promise<MindwtrClient> {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Mindwtr database not found: ${dbPath}. Spusť nejdřív Mindwtr app, nebo oprav mindwtr.dbPath v configu.`,
    );
  }
  const { Database } = await import('bun:sqlite');
  const db = new Database(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  const client = {
    run: async (sql: string, params: unknown[] = []) => {
      db.prepare(sql).run(params);
    },
    all: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(params) as T[],
    get: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).get(params) as T | undefined,
    exec: async (sql: string) => {
      db.exec(sql);
    },
  };

  const adapter = new SqliteAdapter(client);
  await adapter.ensureSchema();
  setStorageAdapter(adapter);
  await useTaskStore.getState().fetchData();
  const queue = createSerializedAsyncQueue();

  return {
    addInboxTask: (input) =>
      queue.run(async () => {
        const state = useTaskStore.getState();
        await state.fetchData();
        const before = new Set(useTaskStore.getState()._allTasks.map((t: Task) => t.id));
        const result = await state.addTask(input.title, {
          status: 'inbox',
          description: input.description,
          tags: input.tags ?? [],
        } as Partial<Task>);
        if (!result.success) {
          throw new Error(result.error || 'Failed to create task.');
        }
        await flushPendingSave();
        const created = useTaskStore
          .getState()
          ._allTasks.find((t: Task) => !before.has(t.id));
        if (!created) throw new Error('Failed to locate newly created task.');
        return created;
      }),
    close: () => db.close(),
  };
}
```

Pokud typecheck spadne na exportech `@mindwtr/core` (typy `_allTasks`/`addTask` nejsou veřejně typované), použít stejný trik jako `apps/mcp-server/src/core-adapter.ts`: `const core = (await import('@mindwtr/core')) as CoreModule;` s lokálním `CoreModule` typem zkopírovaným z core-adapteru (řádky 4–38) a volat přes `core.useTaskStore` atd. Chování zůstává stejné.

- [ ] **Step 4: Spustit test — musí projít**

Run: `cd apps/companion && bun test src/mindwtr.test.ts`
Expected: PASS (2 testy)

- [ ] **Step 5: Commit**

```bash
git add apps/companion/src/mindwtr.ts apps/companion/src/mindwtr.test.ts
git commit -m "feat(companion): mindwtr core adapter for inbox task creation"
```

---

### Task 8: Sync orchestrace (`sync.ts`)

**Files:**
- Create: `apps/companion/src/sync.ts`
- Create: `apps/companion/src/sync.test.ts`

- [ ] **Step 1: Napsat failing test**

```typescript
// apps/companion/src/sync.test.ts
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
```

- [ ] **Step 2: Spustit test — musí selhat**

Run: `cd apps/companion && bun test src/sync.test.ts`
Expected: FAIL — `Cannot find module './sync.js'`

- [ ] **Step 3: Implementovat sync.ts**

```typescript
// apps/companion/src/sync.ts
import {
  externalIdFor,
  fetchNewMessages,
  mapMessageToTask,
  parseCursor,
  serializeCursor,
} from './connectors/gmail.js';
import type { GmailConfig } from './config.js';
import type { Logger } from './logger.js';
import type { CompanionState } from './state.js';

export type GmailSyncDeps = {
  fetchNewMessages: typeof fetchNewMessages;
  addInboxTask: (input: { title: string; description: string; tags: string[] }) => Promise<{ id: string }>;
  state: CompanionState;
  log: Logger;
};

export type GmailSyncResult = {
  imported: number;
  skipped: number;
};

export async function runGmailSync(
  config: GmailConfig,
  deps: GmailSyncDeps,
): Promise<GmailSyncResult> {
  const previousCursor = parseCursor(deps.state.getCursor('gmail'));
  const { messages, cursor } = await deps.fetchNewMessages(config, previousCursor);

  let imported = 0;
  let skipped = 0;
  for (const msg of messages) {
    const externalId = externalIdFor(msg, cursor.uidValidity);
    if (deps.state.hasImport('gmail', externalId)) {
      skipped += 1;
      continue;
    }
    const task = await deps.addInboxTask(mapMessageToTask(msg));
    deps.state.recordImport('gmail', externalId, task.id);
    deps.log.info('gmail message imported', { externalId, taskId: task.id, uid: msg.uid });
    imported += 1;
  }

  // Kurzor až po úspěšném zpracování všech zpráv — při pádu se příště
  // zprávy stáhnou znovu a dedup je zahodí.
  deps.state.setCursor('gmail', serializeCursor(cursor));
  return { imported, skipped };
}
```

- [ ] **Step 4: Spustit test — musí projít**

Run: `cd apps/companion && bun test src/sync.test.ts`
Expected: PASS (3 testy)

- [ ] **Step 5: Commit**

```bash
git add apps/companion/src/sync.ts apps/companion/src/sync.test.ts
git commit -m "feat(companion): gmail sync orchestration with dedup and cursor"
```

---

### Task 9: Daemon vstup (`index.ts`)

**Files:**
- Create: `apps/companion/src/index.ts`

Tenká slupka — logika je otestovaná v modulech, index jen drátuje. Bez unit testu; ověření smoke-testem.

- [ ] **Step 1: Implementovat index.ts**

```typescript
// apps/companion/src/index.ts
import { fetchNewMessages } from './connectors/gmail.js';
import { defaultConfigPath, loadConfig } from './config.js';
import { createLogger, errorContext } from './logger.js';
import { openMindwtr } from './mindwtr.js';
import { openState } from './state.js';
import { runGmailSync } from './sync.js';

const once = process.argv.includes('--once');
const log = createLogger();

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.gmail || !config.gmail.enabled) {
    log.info('gmail connector disabled or not configured', { configPath: defaultConfigPath() });
    return;
  }
  const gmail = config.gmail;
  const state = openState(config.state.path);
  const mindwtr = await openMindwtr(config.mindwtr.dbPath);

  const tick = async (): Promise<void> => {
    try {
      const result = await runGmailSync(gmail, {
        fetchNewMessages,
        addInboxTask: mindwtr.addInboxTask,
        state,
        log,
      });
      log.info('gmail sync finished', { ...result });
    } catch (error) {
      // Izolovaný pád konektoru: zalogovat a čekat na další tick.
      log.error('gmail sync failed', errorContext(error));
      if (once) throw error;
    }
  };

  if (once) {
    try {
      await tick();
    } finally {
      state.close();
      mindwtr.close();
    }
    return;
  }

  log.info('companion daemon started', { pollSeconds: gmail.pollSeconds });
  await tick();
  setInterval(() => {
    void tick();
  }, gmail.pollSeconds * 1000);
}

main().catch((error) => {
  log.error('companion crashed', errorContext(error));
  process.exit(1);
});
```

- [ ] **Step 2: Smoke test bez configu — čistá chyba**

Run: `cd apps/companion && MINDWTR_COMPANION_CONFIG=/tmp/does-not-exist.toml bun run once; echo "exit: $?"`
Expected: log `companion crashed` s ENOENT, `exit: 1`.

- [ ] **Step 3: Smoke test s testovacím configem proti dočasné DB**

```bash
cd apps/companion
TMPDIR_SMOKE=$(mktemp -d)
touch "$TMPDIR_SMOKE/mindwtr.db"
cat > "$TMPDIR_SMOKE/config.toml" <<EOF
[mindwtr]
dbPath = "$TMPDIR_SMOKE/mindwtr.db"
[state]
path = "$TMPDIR_SMOKE/state.sqlite"
EOF
MINDWTR_COMPANION_CONFIG="$TMPDIR_SMOKE/config.toml" bun run once
```
Expected: exit 0, log `gmail connector disabled or not configured` (sekce [gmail] chybí).

- [ ] **Step 4: Typecheck + lint + celá testovací sada**

Run: `cd apps/companion && bunx tsc --noEmit && bun run lint && bun test`
Expected: vše PASS

- [ ] **Step 5: Commit**

```bash
git add apps/companion/src/index.ts
git commit -m "feat(companion): daemon entrypoint with --once mode"
```

---

### Task 10: Launchd agent + dokumentace

**Files:**
- Create: `apps/companion/launchd/tech.lubman.mindwtr-companion.plist`
- Modify: `apps/companion/README.md` (sekce Launchd)

- [ ] **Step 1: Vytvořit plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>tech.lubman.mindwtr-companion</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/lubman/.bun/bin/bun</string>
        <string>/Users/lubman/Sites/Mindwtr/apps/companion/src/index.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/lubman/Sites/Mindwtr/apps/companion</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/lubman/Library/Logs/mindwtr-companion/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/lubman/Library/Logs/mindwtr-companion/launchd.err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Doplnit README sekci Launchd**

Přidat na konec `apps/companion/README.md`:

```markdown
## Launchd (trvalý běh na macOS)

    mkdir -p ~/Library/Logs/mindwtr-companion
    cp launchd/tech.lubman.mindwtr-companion.plist ~/Library/LaunchAgents/
    launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/tech.lubman.mindwtr-companion.plist

Zastavení: `launchctl bootout gui/$(id -u)/tech.lubman.mindwtr-companion`
Logy: `~/Library/Logs/mindwtr-companion/companion.log` (JSONL)
```

- [ ] **Step 3: Commit**

```bash
git add apps/companion/launchd apps/companion/README.md
git commit -m "feat(companion): launchd agent template and setup docs"
```

---

### Task 11: End-to-end ověření s reálným Gmailem (manuální, s uživatelem)

**Files:** žádné (konfigurace mimo repo)

- [ ] **Step 1: Uživatel vytvoří App Password a config**

Uživatel: na capture účtu zapnout 2FA, vytvořit App Password, vyplnit `~/.config/mindwtr-companion/config.toml` dle `config.example.toml`.

- [ ] **Step 2: Baseline běh**

Run: `cd apps/companion && bun run once`
Expected: exit 0, log `gmail sync finished {"imported":0,"skipped":0}` — první běh jen nastavil kurzor.

- [ ] **Step 3: Test importu**

Uživatel pošle testovací mail do capture schránky, pak:
Run: `cd apps/companion && bun run once`
Expected: log `gmail message imported`, `imported: 1`.

- [ ] **Step 4: Ověřit v Mindwtr**

V Mindwtr (desktop app nebo MCP `mindwtr_list_tasks` se status `inbox`): task s titulkem = předmět mailu, tag `gmail`, description s Od/Datum/Gmail odkazem.

- [ ] **Step 5: Idempotence**

Run: `cd apps/companion && bun run once`
Expected: `imported: 0` — žádný duplicitní task.

- [ ] **Step 6: Nasadit launchd agent (volitelné, dle Task 10 README)**

- [ ] **Step 7: Závěrečný push**

```bash
git push fork lubman
```

---

## Poznámky pro implementátora

- **Nikdy neměnit root soubory repa** (package.json, CI workflow, eslint config) — drží minimální merge plochu vůči upstreamu. Výjimka: `bun.lock` (mění ho `bun install` automaticky).
- **Core singleton:** `@mindwtr/core` drží globální zustand store. `openMindwtr` volat jednou za proces. V testech je `mindwtr.test.ts` jediný soubor, který core používá — bun test pouští soubory sekvenčně v jednom procesu, takže to nekoliduje.
- **Desktop app a souběžný zápis:** stejný režim jako mcp-server (WAL + busy_timeout). Desktop si změny načte při refreshi dat; to je existující chování, companion nic nového nezavádí.
- **Secrets:** app password jen v `~/.config/mindwtr-companion/config.toml` (chmod 600 doporučeno), nikdy v repu ani v logu — logger nesmí dostat config jako context.
