import type { JSX } from 'preact';
import { useId } from 'preact/hooks';

/** Bounds and callbacks belong to the caller; the stepper never rewrites another field. */
export interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
  hint?: string;
  error?: string;
  disabledReason?: string;
}

/** A keyboard/touch spinbutton with explicit bounds and contextual diagnostics. */
export function Stepper(props: StepperProps): JSX.Element {
  const id = useId();
  const disabled = Boolean(props.disabledReason);
  const describedBy = [props.hint && `${id}-hint`, props.error && `${id}-error`, disabled && `${id}-disabled`].filter(Boolean).join(' ') || undefined;
  function change(delta: number): void {
    const next = props.value + delta;
    if (!disabled && Number.isSafeInteger(next) && next >= props.min && next <= props.max) props.onChange(next);
  }
  return <div class="kit-field">
    <span class="kit-label" id={`${id}-label`}>{props.label}</span>
    <div class="kit-stepper">
      <button type="button" aria-label={`Decrease ${props.label}`} disabled={disabled || props.value <= props.min}
        onClick={() => change(-1)}>−</button>
      <div class="kit-spinbutton" role="spinbutton" tabIndex={0} aria-labelledby={`${id}-label`}
        aria-describedby={describedBy} aria-valuemin={props.min} aria-valuemax={props.max} aria-valuenow={props.value}
        aria-invalid={Boolean(props.error)} aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          // A custom spinbutton must honor the same form lock as its native buttons.
          if (event.currentTarget.closest('fieldset:disabled')) return;
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault(); change(event.key === 'ArrowUp' ? 1 : -1);
          }
        }}>{props.value}</div>
      <button type="button" aria-label={`Increase ${props.label}`} disabled={disabled || props.value >= props.max}
        onClick={() => change(1)}>+</button>
    </div>
    {props.hint && <p class="kit-hint" id={`${id}-hint`}>{props.hint}</p>}
    {props.error && <p class="kit-hint kit-error" id={`${id}-error`}><span aria-hidden="true">● </span>{props.error}</p>}
    {disabled && <p class="kit-hint" id={`${id}-disabled`}>{props.disabledReason}</p>}
  </div>;
}
