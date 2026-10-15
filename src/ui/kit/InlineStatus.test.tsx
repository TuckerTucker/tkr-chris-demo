import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/preact';
import { InlineStatus } from './InlineStatus';
import { expectAccessible, setPreferences } from './__tests__/support';

afterEach(async () => { cleanup(); await setPreferences(); });

test('keeps a stable contextual live region across unchanged messages', async () => {
  const view = render(<main><InlineStatus tone="error" message="Could not save this hole." fixHint="Free some device storage and retry." /></main>);
  const status = view.getByRole('status');
  view.rerender(<main><InlineStatus tone="error" message="Could not save this hole." fixHint="Free some device storage and retry." /></main>);
  expect(view.getByRole('status')).toBe(status);
  expect(status.getAttribute('aria-live')).toBe('polite');
  expect(status.textContent).toContain('Free some device storage');
  expect(getComputedStyle(status).position).toBe('static');
  await expectAccessible(view.container);
});

test.each(['light', 'dark'])('status text meets contrast in %s mode and honors stronger contrast', async (scheme) => {
  await setPreferences([{ name: 'prefers-color-scheme', value: scheme }]);
  const view = render(<main><InlineStatus tone="error" message="Save failed." fixHint="Retry when storage is available." /></main>);
  await expectAccessible(view.container);
  await setPreferences([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-contrast', value: 'more' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  const hint = view.container.querySelector('.kit-status-hint');
  expect(hint && getComputedStyle(hint).color).toBe(getComputedStyle(document.documentElement).color);
  expect(getComputedStyle(view.getByRole('status')).transitionDuration).toBe('0s');
  await expectAccessible(view.container);
});
