import { act, cleanup, renderHook } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import type { HoleDraft } from '../../domain';
import { HoleDraftValidationError, useHoleEditor } from './useHoleEditor';

afterEach(cleanup);

test.each([3, 4, 5])('initializes par %s once, with explicit fairway eligibility', (par) => {
  const edits: HoleDraft[] = [];
  const { result } = renderHook(() => useHoleEditor({ holeNumber: 7, suggestedPar: par, onDraftChange: (draft) => edits.push(draft) }));
  expect(result.current.draft).toEqual({ number: 7, par, strokes: par, putts: 2, fairway: par === 3 ? 'n/a' : null });
  expect(result.current.gir).toBe(true);
  expect(result.current.canSave).toBe(par === 3);
  expect(edits).toEqual([]);
});

test('changing par never rewrites strokes/putts and returning from par three requires a choice', () => {
  const { result } = renderHook(() => useHoleEditor({ holeNumber: 1, suggestedPar: 4, onDraftChange: () => undefined }));
  act(() => { result.current.set('fairway', 'hit'); result.current.set('par', 3); });
  expect(result.current.draft).toEqual({ number: 1, par: 3, strokes: 4, putts: 2, fairway: 'n/a' });
  act(() => result.current.set('par', 5));
  expect(result.current.draft).toEqual({ number: 1, par: 5, strokes: 4, putts: 2, fairway: null });
});

test('rapid field changes preserve the latest values and invalid combinations', () => {
  const changes: HoleDraft[] = [];
  const { result } = renderHook(() => useHoleEditor({ holeNumber: 1, suggestedPar: 4, onDraftChange: (draft) => changes.push(draft) }));
  act(() => { result.current.set('strokes', 2); result.current.set('putts', 3); result.current.set('fairway', 'missed'); });
  expect(result.current.draft).toEqual({ number: 1, par: 4, strokes: 2, putts: 3, fairway: 'missed' });
  expect(changes.map((draft) => [draft.strokes, draft.putts, draft.fairway])).toEqual([[2, 2, null], [2, 3, null], [2, 3, 'missed']]);
  expect(result.current.gir).toBeNull(); expect(result.current.canSave).toBe(false);
  expect(() => result.current.toHole()).toThrow(HoleDraftValidationError);
});

test('restores invalid drafts exactly and ignores later suggestions or initial objects', () => {
  const initial: HoleDraft = { number: 2, par: 4, strokes: 1, putts: 3, fairway: null };
  const { result, rerender } = renderHook(({ par, draft }) => useHoleEditor({
    holeNumber: 2, initial: draft, suggestedPar: par, onDraftChange: () => undefined,
  }), { initialProps: { par: 4, draft: initial } });
  expect(result.current.draft).toEqual(initial);
  act(() => result.current.set('strokes', 6));
  rerender({ par: 5, draft: { ...initial, strokes: 5 } });
  expect(result.current.draft.strokes).toBe(6); expect(result.current.draft.par).toBe(4);
});

test('late suggestion never overwrites edits and toHole sees synchronous latest values', () => {
  const { result, rerender } = renderHook(({ par }) => useHoleEditor({ holeNumber: 1, suggestedPar: par, onDraftChange: () => undefined }),
    { initialProps: { par: 4 } });
  act(() => { result.current.set('fairway', 'hit'); result.current.set('strokes', 5);
    expect(result.current.toHole().strokes).toBe(5); });
  rerender({ par: 3 });
  expect(result.current.draft).toEqual({ number: 1, par: 4, strokes: 5, putts: 2, fairway: 'hit' });
});

test('an unanswered fairway does not hide a calculable GIR', () => {
  const { result } = renderHook(() => useHoleEditor({ holeNumber: 1, suggestedPar: 4, onDraftChange: () => undefined }));
  expect(result.current.gir).toBe(true); expect(result.current.canSave).toBe(false);
  expect(() => result.current.toHole()).toThrow(HoleDraftValidationError);
  act(() => result.current.set('fairway', 'hit'));
  expect(result.current.toHole()).toEqual({ number: 1, par: 4, strokes: 4, putts: 2, fairway: 'hit' });
});
