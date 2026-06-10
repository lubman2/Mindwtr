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
