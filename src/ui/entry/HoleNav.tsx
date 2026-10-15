import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** Recorded holes remain reachable for correction; future holes stay visibly unavailable. */
export function HoleNav({ recorded, current, availableNext, onSelect }: { recorded: number; current: number; availableNext?: number; onSelect(number: number): void }): JSX.Element {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = strip.current;
    const selected = element?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!element || !selected) return;
    const parentBounds = element.getBoundingClientRect();
    const childBounds = selected.getBoundingClientRect();
    if (childBounds.right > parentBounds.right) element.scrollLeft += childBounds.right - parentBounds.right + 4;
    if (childBounds.left < parentBounds.left) element.scrollLeft -= parentBounds.left - childBounds.left + 4;
  }, [current]);
  return <nav class="entry-hole-nav" aria-label="Holes"><div class="entry-hole-strip" ref={strip}>
    {Array.from({ length: 18 }, (_, index) => index + 1).map((number) => <button key={number}
      aria-label={`Hole ${number}${number > recorded && number !== current && number !== availableNext ? ', not yet available' : ''}`}
      aria-current={number === current ? 'step' : undefined} disabled={number > recorded && number !== current && number !== availableNext}
      onClick={() => onSelect(number)}>{String(number).padStart(2, '0')}</button>)}
    </div></nav>;
}
