import type { JSX } from 'preact';
import { ChipToggle, InlineStatus } from '../ui/kit';
import { useSnapshot } from './hooks';
import type { ThemeController, ThemePreference } from './theme';

/** Persistent appearance control, with native radio keyboard behavior and inline feedback. */
export function ThemeChooser({ controller }: { controller: ThemeController }): JSX.Element {
  const { preference, error } = useSnapshot(controller);
  return <div class="app-theme">
    <ChipToggle<ThemePreference> label="Theme" value={preference} onChange={controller.select}
      options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
    {error && <InlineStatus tone="error" message={error} />}
  </div>;
}
