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
  // SIGTERM cleanup záměrně chybí: kurzor se ukládá až po celé dávce a dedup
  // přežije restart, launchd proces stejně obnoví (KeepAlive).
  let running = false;
  setInterval(() => {
    if (running) {
      log.info('gmail tick skipped — previous still running');
      return;
    }
    running = true;
    void tick().finally(() => {
      running = false;
    });
  }, gmail.pollSeconds * 1000);
}

main().catch((error) => {
  log.error('companion crashed', errorContext(error));
  process.exit(1);
});
