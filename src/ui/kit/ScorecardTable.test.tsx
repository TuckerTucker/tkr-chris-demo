import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/preact';
import { userEvent } from 'vitest/browser';
import { useState } from 'preact/hooks';
import { roundTotals } from '../../domain';
import type { Hole } from '../../domain';
import { ScorecardTable } from './ScorecardTable';
import { Stepper } from './Stepper';
import { expectAccessible, expectTouchTargets } from './__tests__/support';

afterEach(cleanup);
const holes: Hole[] = Array.from({ length: 18 }, (_, index) => ({ number: index + 1, par: index === 0 ? 3 : 4,
  strokes: index === 0 ? 3 : 4, putts: 2, fairway: index === 0 ? 'n/a' : 'hit' }));

test.each([9, 18])('renders semantic rows and correct totals for %i holes', async (count) => {
  const card = holes.slice(0, count);
  const view = render(<main><ScorecardTable holes={card} totals={{ total: roundTotals(card) }} /></main>);
  expect(view.getByRole('table', { name: 'Scorecard' })).not.toBeNull();
  expect(view.getAllByRole('columnheader')).toHaveLength(6);
  expect(view.getAllByRole('row')).toHaveLength(count + (count === 18 ? 4 : 2));
  expect(view.getByRole('rowheader', { name: 'Total' })).not.toBeNull();
  expect(Boolean(view.queryByRole('rowheader', { name: 'Out' }))).toBe(count === 18);
  expect(Boolean(view.queryByRole('rowheader', { name: 'In' }))).toBe(count === 18);
  expect(view.getByText('n/a')).not.toBeNull();
  await expectAccessible(view.container);
});

test('keyboard editing stays in an in-cell button and a separate colspan row', async () => {
  const chosen: number[] = [];
  const view = render(<main><ScorecardTable holes={holes.slice(0, 9)} totals={{ total: roundTotals(holes.slice(0, 9)) }}
    selectedHole={1} onHoleSelect={(number) => chosen.push(number)} renderEditor={(number) => <label>Strokes for hole {number}<input type="number" value={3} /></label>} /></main>);
  const button = view.getByRole('button', { name: 'Edit hole 2' });
  button.focus(); await userEvent.keyboard('{Enter}');
  expect(chosen).toEqual([2]);
  expect(button.closest('tr')?.getAttribute('role')).toBeNull();
  const editor = view.getByRole('group', { name: 'Edit hole 1' });
  expect(editor.closest('td')?.colSpan).toBe(6);
  expect(editor.closest('tr')?.previousElementSibling?.querySelector('button')?.textContent).toBe('1');
  expectTouchTargets(view.container);
  await expectAccessible(view.container);
});

test('collapsed back-nine rows retain full Out, In and Total statistics', async () => {
  const view = render(<main><ScorecardTable holes={holes} totals={{ total: roundTotals(holes) }} showBackNine={false} /></main>);
  expect(view.getAllByRole('row')).toHaveLength(13);
  expect(view.queryByRole('rowheader', { name: '10', exact: true })).toBeNull();
  const values = (name: string): (string | null)[] => Array.from(
    view.getByRole('rowheader', { name }).closest('tr')?.querySelectorAll('td') ?? [],
  ).map((cell) => cell.textContent);
  expect(values('Out')).toEqual(['35', '35', '18', '9/9', '8/8']);
  expect(values('In')).toEqual(['36', '36', '18', '9/9', '9/9']);
  expect(values('Total')).toEqual(['71', '71', '36', '18/18', '17/17']);
  await expectAccessible(view.container);
});

test('focused region scrolls with arrows while descendant stepper keys retain editing', async () => {
  function Editor() {
    const [value, setValue] = useState(4);
    return <Stepper label="Strokes" value={value} min={1} max={20} onChange={setValue} />;
  }
  const view = render(<main style={{ width: '240px' }}><ScorecardTable holes={holes.slice(0, 9)}
    totals={{ total: roundTotals(holes.slice(0, 9)) }} selectedHole={1} renderEditor={() => <Editor />} /></main>);
  const region = view.getByRole('region', { name: 'Scrollable scorecard' });
  region.focus(); await userEvent.keyboard('{ArrowRight}');
  expect(region.scrollLeft).toBe(48);
  await userEvent.keyboard('{ArrowLeft}');
  expect(region.scrollLeft).toBe(0);
  const value = view.getByRole('spinbutton', { name: 'Strokes' });
  value.focus();
  const before = region.scrollLeft;
  await userEvent.keyboard('{ArrowUp}');
  expect(value.getAttribute('aria-valuenow')).toBe('5');
  expect(region.scrollLeft).toBe(before);
});

test('pending selection preserves native buttons and rejects activation until enabled', async () => {
  const chosen: number[] = [];
  const select = (number: number): void => { chosen.push(number); };
  const card = holes.slice(0, 9);
  const view = render(<ScorecardTable holes={card} totals={{ total: roundTotals(card) }} onHoleSelect={select} />);
  const button = view.getByRole('button', { name: 'Edit hole 1' });
  view.rerender(<ScorecardTable holes={card} totals={{ total: roundTotals(card) }} onHoleSelect={select} selectionDisabled />);
  expect(view.getByRole('button', { name: 'Edit hole 1' })).toBe(button);
  expect((button as HTMLButtonElement).disabled).toBe(true);
  button.click();
  expect(chosen).toEqual([]);
  view.rerender(<ScorecardTable holes={card} totals={{ total: roundTotals(card) }} onHoleSelect={select} />);
  expect(view.getByRole('button', { name: 'Edit hole 1' })).toBe(button);
  await userEvent.click(button);
  expect(chosen).toEqual([1]);
});
