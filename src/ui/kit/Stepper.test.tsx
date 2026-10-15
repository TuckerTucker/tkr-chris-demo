import { afterEach, expect, test } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { page, userEvent } from 'vitest/browser';
import { Stepper } from './Stepper';
import { expectAccessible, expectTouchTargets, setPreferences } from './__tests__/support';

afterEach(async () => { cleanup(); document.documentElement.style.fontSize = ''; await page.viewport(1024, 768); await setPreferences(); });

test('keyboard and buttons respect bounds while retaining independent fields', async () => {
  function Form(): JSX.Element {
    const [strokes, setStrokes] = useState(3);
    return <main><Stepper label="Strokes" value={strokes} min={1} max={4} onChange={setStrokes} />
      <Stepper label="Putts" value={2} min={0} max={Number.MAX_SAFE_INTEGER} onChange={() => undefined}
        error={2 >= strokes ? 'Putts must be fewer than strokes.' : undefined} /></main>;
  }
  const view = render(<Form />);
  const strokes = view.getByRole('spinbutton', { name: 'Strokes' });
  strokes.focus();
  await userEvent.keyboard('{ArrowDown}');
  await waitFor(() => expect(strokes.getAttribute('aria-valuenow')).toBe('2'));
  expect(view.getByRole('spinbutton', { name: 'Putts' }).getAttribute('aria-valuenow')).toBe('2');
  expect(view.getByRole('spinbutton', { name: 'Putts' }).getAttribute('aria-invalid')).toBe('true');
  await userEvent.keyboard('{ArrowDown}{ArrowDown}');
  expect(strokes.getAttribute('aria-valuenow')).toBe('1');
  expect((view.getByRole('button', { name: 'Decrease Strokes' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(view.getByRole('button', { name: 'Increase Strokes' }));
  expect(strokes.getAttribute('aria-valuenow')).toBe('2');
  expectTouchTargets(view.container);
  await expectAccessible(view.container);
});

test('disabled reason and errors describe the focused spinbutton', async () => {
  const values: number[] = [];
  const view = render(<main><Stepper label="Par" value={4} min={3} max={5} onChange={(value) => values.push(value)}
    disabledReason="Saving this hole." hint="Choose the printed par." error="Retry saving this hole." /></main>);
  const control = view.getByRole('spinbutton');
  control.focus(); await userEvent.keyboard('{ArrowUp}');
  expect(values).toEqual([]);
  for (const id of control.getAttribute('aria-describedby')?.split(' ') ?? []) expect(document.getElementById(id)).not.toBeNull();
  expect(control.getAttribute('aria-disabled')).toBe('true');
  expect(control.getAttribute('aria-invalid')).toBe('true');
  await expectAccessible(view.container);
});

test('a parent form lock prevents keyboard edits and unlock restores interaction', async () => {
  const values: number[] = [];
  const view = render(<main><fieldset disabled><legend>Saving scorecard</legend>
    <Stepper label="Strokes" value={4} min={1} max={20} onChange={(value) => values.push(value)} />
  </fieldset></main>);
  const control = view.getByRole('spinbutton');
  control.focus(); await userEvent.keyboard('{ArrowUp}');
  expect(values).toEqual([]);
  view.getByRole('group').removeAttribute('disabled');
  await userEvent.keyboard('{ArrowUp}');
  expect(values).toEqual([5]);
});

test('safe-integer limit, narrow viewport, enlarged text and dark contrast remain usable', async () => {
  await page.viewport(320, 700);
  document.documentElement.style.fontSize = '200%';
  await setPreferences([{ name: 'prefers-color-scheme', value: 'dark' }]);
  const view = render(<main><Stepper label="Strokes" value={Number.MAX_SAFE_INTEGER} min={1} max={Number.MAX_SAFE_INTEGER}
    onChange={() => { throw new Error('The safe integer bound must prevent changes.'); }} hint="Whole-number strokes" /></main>);
  view.getByRole('spinbutton').focus(); await userEvent.keyboard('{ArrowUp}');
  expect((view.getByRole('button', { name: 'Increase Strokes' }) as HTMLButtonElement).disabled).toBe(true);
  expectTouchTargets(view.container);
  for (const button of view.container.querySelectorAll('button')) {
    expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(320);
  }
  expect(getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()).toBe('#000');
  await expectAccessible(view.container);
});
