import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { userEvent } from 'vitest/browser';
import { ChipToggle } from './ChipToggle';
import { expectAccessible, expectTouchTargets } from './__tests__/support';

afterEach(cleanup);
const options = [{ value: 'hit', label: 'Hit' }, { value: 'missed', label: 'Missed' }] as const;

test('radio keyboard arrows move focus and selection with one tab stop', async () => {
  function Form(): JSX.Element {
    const [value, setValue] = useState<'hit' | 'missed' | null>(null);
    return <main><ChipToggle<'hit' | 'missed'> label="Fairway" options={options} value={value} onChange={setValue} /></main>;
  }
  const view = render(<Form />);
  const hit = view.getByRole('radio', { name: 'Hit' });
  const missed = view.getByRole('radio', { name: 'Missed' });
  expect(hit.tabIndex).toBe(0); expect(missed.tabIndex).toBe(-1);
  hit.focus(); await userEvent.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(missed);
  expect(missed.getAttribute('aria-checked')).toBe('true');
  expect(hit.tabIndex).toBe(-1); expect(missed.tabIndex).toBe(0);
  await userEvent.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(hit);
  await userEvent.keyboard('{End}'); expect(document.activeElement).toBe(missed);
  expectTouchTargets(view.container);
  await expectAccessible(view.container);
});

test('disabled chips expose the reason and ignore interaction', async () => {
  const values: string[] = [];
  const view = render(<main><ChipToggle label="Fairway" options={options} value="hit"
    onChange={(value) => values.push(value)} disabledReason="Not applicable on par 3." /></main>);
  const group = view.getByRole('radiogroup');
  const reason = group.getAttribute('aria-describedby');
  expect(reason && document.getElementById(reason)?.textContent).toBe('Not applicable on par 3.');
  for (const radio of view.getAllByRole('radio')) {
    expect((radio as HTMLButtonElement).disabled).toBe(true);
    radio.click();
  }
  expect(values).toEqual([]);
  await expectAccessible(view.container);
});
