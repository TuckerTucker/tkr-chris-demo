import { pino } from 'pino';
import type { Level, Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

/** Emit structured lifecycle events; callers log identifiers and counts only. */
export function createLogger(opts: { level?: Level } = {}): Logger {
  return pino({ level: opts.level ?? 'info', browser: { asObject: true } });
}
