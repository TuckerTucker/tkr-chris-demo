import { Fragment } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import type { Hole, RoundTotals } from '../../domain';
import { isGreenInRegulation, roundTotals } from '../../domain';

/** Optional editor content occupies its own semantic table row below the selected hole. */
export interface ScorecardTableProps {
  holes: readonly Hole[];
  totals: { out?: RoundTotals; in?: RoundTotals; total: RoundTotals };
  onHoleSelect?(number: number): void;
  selectedHole?: number;
  selectionDisabled?: boolean;
  renderEditor?(number: number): ComponentChildren;
  showBackNine?: boolean;
}

function TotalRow({ label, totals }: { label: string; totals: RoundTotals }): JSX.Element {
  return <tr class="kit-total"><th scope="row">{label}</th><td>{totals.par}</td><td>{totals.strokes}</td>
    <td>{totals.putts}</td><td>{totals.gir}/{totals.holesPlayed}</td>
    <td>{totals.fairwaysEligible ? `${totals.fairwaysHit}/${totals.fairwaysEligible}` : 'n/a'}</td></tr>;
}

/** Accessible per-hole scores with derived GIR and optional keyboard editing. */
export function ScorecardTable(props: ScorecardTableProps): JSX.Element {
  const backNine = props.holes.length > 9;
  return <div class="kit-scorecard-scroll" role="region" aria-label="Scrollable scorecard" tabIndex={0}
    onKeyDown={(event) => {
      // iOS WebKit does not provide native arrow scrolling for a focused region.
      // Descendant editors keep their own arrow-key behavior.
      if (event.target !== event.currentTarget || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      event.preventDefault();
      event.currentTarget.scrollBy({ left: event.key === 'ArrowRight' ? 48 : -48, behavior: 'instant' });
    }}>
    <table class="kit-scorecard">
      <caption>Scorecard</caption>
      <thead><tr><th scope="col">HOLE</th><th scope="col">PAR</th><th scope="col"><abbr title="Strokes">STR</abbr></th>
        <th scope="col"><abbr title="Putts">PUTT</abbr></th><th scope="col"><abbr title="Green in regulation">GIR</abbr></th>
        <th scope="col"><abbr title="Fairway">FWY</abbr></th></tr></thead>
      <tbody>{props.holes.filter((hole) => props.showBackNine !== false || hole.number <= 9).map((hole) => <Fragment key={hole.number}>
        <tr data-selected={props.selectedHole === hole.number}>
          <th scope="row">{props.onHoleSelect ? <button class="kit-hole-button" type="button" aria-label={`Edit hole ${hole.number}`}
            disabled={props.selectionDisabled} aria-pressed={props.selectedHole === hole.number} onClick={() => props.onHoleSelect?.(hole.number)}>{hole.number}</button> : hole.number}</th>
          <td>{hole.par}</td><td>{hole.strokes}</td><td>{hole.putts}</td>
          <td>{isGreenInRegulation(hole) ? 'Yes' : 'No'}</td><td>{hole.par === 3 ? 'n/a' : hole.fairway === 'hit' ? 'Hit' : 'Missed'}</td>
        </tr>
        {props.selectedHole === hole.number && props.renderEditor && <tr><td class="kit-editor" colSpan={6}>
          <div role="group" aria-label={`Edit hole ${hole.number}`}>{props.renderEditor(hole.number)}</div>
        </td></tr>}
        {backNine && hole.number === 9 && <TotalRow label="Out" totals={props.totals.out ?? roundTotals(props.holes.slice(0, 9))} />}
      </Fragment>)}</tbody>
      <tfoot>{backNine && <TotalRow label="In" totals={props.totals.in ?? roundTotals(props.holes.slice(9))} />}
        <TotalRow label="Total" totals={props.totals.total} /></tfoot>
    </table>
  </div>;
}
