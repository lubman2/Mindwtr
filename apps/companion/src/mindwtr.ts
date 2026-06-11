import { existsSync } from 'fs';

// ---------- Local type mirror of @mindwtr/core (matches core-adapter.ts) ----------

type Task = {
  id: string;
  title: string;
  status: string;
  description?: string;
  tags?: string[];
  [key: string]: unknown;
};

type CoreActionResult = {
  success: boolean;
  error?: string;
};

type CoreStore = {
  getState: () => {
    _allTasks: Task[];
    fetchData: () => Promise<void>;
    addTask: (title: string, initialProps?: Partial<Task>) => Promise<CoreActionResult>;
  };
};

type SerializedAsyncQueue = {
  run: <T>(fn: () => Promise<T> | T) => Promise<T>;
};

type CoreModule = {
  setStorageAdapter: (adapter: unknown) => void;
  flushPendingSave: () => Promise<void>;
  createSerializedAsyncQueue: () => SerializedAsyncQueue;
  useTaskStore: CoreStore;
  SqliteAdapter: new (client: unknown) => { ensureSchema: () => Promise<void> };
};

// ---------- Public API ----------

export type NewInboxTask = {
  title: string;
  description?: string;
  tags?: string[];
};

export type MindwtrClient = {
  addInboxTask: (input: NewInboxTask) => Promise<Task>;
  /** Volat až po doběhnutí všech addInboxTask — close není serializovaný přes frontu. */
  close: () => void;
};

// ---------- Implementation ----------

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

  const sqliteClient = {
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

  const core = (await import('@mindwtr/core')) as unknown as CoreModule;
  const queue = core.createSerializedAsyncQueue();
  const adapter = new core.SqliteAdapter(sqliteClient);
  await adapter.ensureSchema();
  core.setStorageAdapter(adapter);
  await core.useTaskStore.getState().fetchData();

  return {
    addInboxTask: (input: NewInboxTask) =>
      queue.run(async () => {
        const state = core.useTaskStore.getState();
        await state.fetchData();
        // Stejný vzor jako core-adapter v mcp-serveru: `state` je snapshot před fetchData,
        // fronta serializuje souběh uvnitř procesu. Externí zápis (desktop app) mezi
        // fetchData a diffem může v krajním případě připsat cizí task_id do stavové DB —
        // dedup i import zůstávají korektní.
        const before = new Set(state._allTasks.map((t: Task) => t.id));
        const result = await state.addTask(input.title, {
          status: 'inbox',
          description: input.description,
          tags: input.tags ?? [],
        } as Partial<Task>);
        if (!result.success) {
          throw new Error(result.error ?? 'Failed to create task.');
        }
        await core.flushPendingSave();
        const created = core.useTaskStore.getState()._allTasks.find((t: Task) => !before.has(t.id));
        if (!created) throw new Error('Failed to locate newly created task.');
        return created;
      }),
    close: () => db.close(),
  };
}
