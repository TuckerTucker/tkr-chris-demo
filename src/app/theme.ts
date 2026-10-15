import type { Logger } from './logger';

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'golf-scorecard.theme';

export interface ThemeSnapshot {
  readonly preference: ThemePreference;
  readonly error: string | null;
}

export interface ThemeController {
  getSnapshot(): ThemeSnapshot;
  subscribe(listener: () => void): () => void;
  select(preference: ThemePreference): void;
  refresh(): void;
}

/** Inject persistence and rendering so theme preferences remain independent of scoring. */
export function createThemeController(options: {
  read(): string | null;
  write(preference: ThemePreference): void;
  apply(preference: ThemePreference): void;
  logger: Pick<Logger, 'info' | 'error'>;
}): ThemeController {
  let state: ThemeSnapshot = { preference: 'system', error: null };
  const listeners = new Set<() => void>();
  const unavailable = 'Theme applied here, but it could not be remembered. Choose it again to retry.';
  function publish(preference: ThemePreference, error: string | null): void {
    state = { preference, error };
    options.apply(preference);
    for (const listener of listeners) listener();
  }
  function refresh(): void {
    try {
      const saved = options.read();
      publish(saved === 'light' || saved === 'dark' ? saved : 'system', null);
    } catch {
      options.logger.error({ event: 'theme.storage', operation: 'read' });
      publish(state.preference, unavailable);
    }
  }
  refresh();
  return {
    getSnapshot: () => state,
    subscribe(listener): () => void { listeners.add(listener); return () => listeners.delete(listener); },
    refresh,
    select(preference): void {
      let error: string | null = null;
      try { options.write(preference); }
      catch {
        error = unavailable;
        options.logger.error({ event: 'theme.storage', operation: 'write' });
      }
      publish(preference, error);
      options.logger.info({ event: 'theme.changed', preference });
    },
  };
}
