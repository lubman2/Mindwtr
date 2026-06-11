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
  // Záměrně užší než NewInboxTask z mindwtr.ts — gmail mapping vždy dodává description i tags.
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
  const rawCursor = deps.state.getCursor('gmail');
  const previousCursor = parseCursor(rawCursor);
  if (rawCursor !== null && previousCursor === null) {
    deps.log.error('gmail cursor unparseable, re-baselining (maily mezitím se neimportují)');
  }
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
  // zprávy stáhnou znovu a dedup je zahodí. Známý kompromis: tvrdý pád
  // procesu mezi addInboxTask a recordImport může při retry vytvořit
  // duplicitní task (two-phase zápis bez společné transakce). Pro osobní
  // daemon přijatelné — duplicita je viditelná v inboxu.
  deps.state.setCursor('gmail', serializeCursor(cursor));
  return { imported, skipped };
}
