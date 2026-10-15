import type { JSX } from 'preact';
import { ChipToggle, Stepper } from '../kit';
import type { HoleEditorState } from './useHoleEditor';

/** Shared entry/correction controls with independent numeric fields and calculated GIR. */
export function HoleEditor({ editor, layout }: { editor: HoleEditorState; layout: 'full' | 'compact' }): JSX.Element {
  const { draft, errors } = editor;
  const error = (field: string): string | undefined => errors.find((item) => item.field === field)?.message;
  return <div class={`hole-editor hole-editor--${layout}`}>
    <Stepper label="Par" value={draft.par} min={3} max={5} onChange={(value) => editor.set('par', value)} error={error('par')} />
    <Stepper label="Strokes" value={draft.strokes} min={1} max={Number.MAX_SAFE_INTEGER}
      onChange={(value) => editor.set('strokes', value)} error={error('strokes')} />
    <Stepper label="Putts" value={draft.putts} min={0} max={Number.MAX_SAFE_INTEGER}
      onChange={(value) => editor.set('putts', value)} error={error('putts')} />
    <div class="entry-fairway"><ChipToggle label={draft.par === 3 ? 'Fairway' : 'Fairway (required)'}
      options={[{ value: 'hit', label: 'Hit' }, { value: 'missed', label: 'Missed' }]}
      value={draft.fairway === 'n/a' ? null : draft.fairway} onChange={(value) => editor.set('fairway', value)}
      disabledReason={draft.par === 3 ? 'Not counted on par 3.' : undefined} />
      {error('fairway') && <p class="kit-hint kit-error">{error('fairway')}</p>}
    </div>
    <div class="entry-gir"><div><p class="entry-eyebrow">Green in regulation · calculated</p>
      <p class="kit-hint">{editor.gir === null ? error('putts') ?? error('strokes') ?? error('par')
        : `On the green in ${draft.strokes - draft.putts} on a par ${draft.par}`}</p></div>
      <strong aria-label={`Green in regulation: ${editor.gir === null ? 'unavailable' : editor.gir ? 'Yes' : 'No'}`}>
        {editor.gir === null ? '—' : editor.gir ? 'Yes' : 'No'}</strong></div>
  </div>;
}
