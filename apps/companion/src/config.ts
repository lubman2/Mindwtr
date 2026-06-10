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
