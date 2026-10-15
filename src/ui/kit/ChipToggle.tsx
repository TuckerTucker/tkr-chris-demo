import type { JSX } from 'preact';
import { useId, useRef } from 'preact/hooks';

/** Typed single-selection values and a visible reason when interaction is unavailable. */
export interface ChipToggleProps<T extends string> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange(value: T): void;
  disabledReason?: string;
}

/** Native buttons implement the radio-group keyboard pattern with roving focus. */
export function ChipToggle<T extends string>(props: ChipToggleProps<T>): JSX.Element {
  const id = useId();
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const disabled = Boolean(props.disabledReason);
  return <fieldset class="kit-field" role="radiogroup" aria-labelledby={`${id}-label`}
    aria-describedby={disabled ? `${id}-disabled` : undefined} aria-disabled={disabled} disabled={disabled}>
    <legend class="kit-label" id={`${id}-label`}>{props.label}</legend>
    <div class="kit-chips">{props.options.map((option, index) => <button key={option.value} type="button"
      role="radio" aria-checked={props.value === option.value} disabled={disabled}
      tabIndex={props.value === option.value || (props.value === null && index === 0) ? 0 : -1}
      ref={(element) => { if (element) refs.current.set(option.value, element); else refs.current.delete(option.value); }}
      onClick={() => { if (!disabled) props.onChange(option.value); }}
      onKeyDown={(event) => {
        if (disabled) return;
        let next: number;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % props.options.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + props.options.length) % props.options.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = props.options.length - 1;
        else return;
        event.preventDefault();
        const selected = props.options[next];
        if (selected) { props.onChange(selected.value); refs.current.get(selected.value)?.focus(); }
      }}>{option.label}</button>)}</div>
    {disabled && <p class="kit-hint" id={`${id}-disabled`}>{props.disabledReason}</p>}
  </fieldset>;
}
