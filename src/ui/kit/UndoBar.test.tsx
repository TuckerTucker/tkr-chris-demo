import { afterEach, expect, test } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/preact';
import { userEvent } from 'vitest/browser';
import { UndoBar } from './UndoBar';
import { expectAccessible, expectTouchTargets } from './__tests__/support';

afterEach(cleanup);

test('awaits undo, disables duplicates and never dismisses on unmount', async () => {
  let calls = 0; let dismissals = 0; let complete: () => void = () => undefined;
  const completion = new Promise<void>((resolve) => { complete = resolve; });
  const view = render(<main><UndoBar message="Round removed." pending={false}
    onUndo={async () => { calls += 1; await completion; }} onDismiss={async () => { dismissals += 1; }} /></main>);
  const undo = view.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
  undo.focus(); await userEvent.keyboard('{Enter}');
  expect(undo.disabled).toBe(true);
  expect((view.getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement).disabled).toBe(true);
  undo.click(); expect(calls).toBe(1);
  complete(); await waitFor(() => expect(undo.disabled).toBe(false));
  expectTouchTargets(view.container);
  await expectAccessible(view.container);
  view.unmount(); expect(dismissals).toBe(0);
});

test('retains a failed action and allows an explicit retry or dismissal', async () => {
  let attempts = 0; let dismissals = 0;
  const view = render(<main><UndoBar message="Round removed." pending={false} onUndo={async () => {
    attempts += 1; if (attempts === 1) throw new Error('Storage is temporarily unavailable.');
  }} onDismiss={async () => { dismissals += 1; }} /></main>);
  await userEvent.click(view.getByRole('button', { name: 'Undo' }));
  expect(view.getByText('Storage is temporarily unavailable.')).not.toBeNull();
  expect(view.getByRole('region', { name: 'Pending round removal' })).not.toBeNull();
  await expectAccessible(view.container);
  await userEvent.click(view.getByRole('button', { name: 'Undo' }));
  expect(attempts).toBe(2);
  expect(view.queryByText('Storage is temporarily unavailable.')).toBeNull();
  await userEvent.click(view.getByRole('button', { name: 'Dismiss' }));
  expect(dismissals).toBe(1);
});

test('external pending/error state remains visible and prevents destructive duplicates', async () => {
  const view = render(<main><UndoBar message="Round removed." pending={true} error="A save is still finishing."
    onUndo={async () => { throw new Error('Must remain disabled'); }} onDismiss={async () => { throw new Error('Must remain disabled'); }} /></main>);
  expect(view.getByText('A save is still finishing.')).not.toBeNull();
  for (const button of view.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
  await expectAccessible(view.container);
});
