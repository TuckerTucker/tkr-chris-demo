/** Recorded fairway result; par-three holes are not eligible. */
export type Fairway = 'hit' | 'missed' | 'n/a';

/** A confirmed hole whose fields satisfy the shared hole rules. */
export interface Hole {
  readonly number: number;
  readonly par: number;
  readonly strokes: number;
  readonly putts: number;
  readonly fairway: Fairway;
}

/** Editable input may have an unanswered fairway field. */
export interface HoleDraft extends Omit<Hole, 'fairway'> {
  readonly fairway: Fairway | null;
}

export type HoleField = 'number' | 'par' | 'strokes' | 'putts' | 'fairway';

/** A contextual validation diagnostic suitable for inline display. */
export interface HoleError {
  readonly field: HoleField;
  readonly code: string;
  readonly message: string;
}

/** Validates confirmed and persisted records using the draft's field rules. */
export function validateHole(hole: Hole): HoleError[] {
  return validateHoleDraft(hole);
}

/** Returns every invalid field without coercing input or throwing on malformed records. */
export function validateHoleDraft(draft: HoleDraft): HoleError[] {
  const value: Partial<Record<HoleField, unknown>> =
    draft !== null && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  const errors: HoleError[] = [];
  const numericRules: readonly [Exclude<HoleField, 'fairway'>, number, number, string][] = [
    ['number', 1, 18, 'Choose a hole from 1 to 18.'],
    ['par', 3, 5, 'Choose a par from 3 to 5.'],
    ['strokes', 1, Number.MAX_SAFE_INTEGER, 'Enter at least 1 stroke.'],
    ['putts', 0, Number.MAX_SAFE_INTEGER, 'Enter 0 or more putts.'],
  ];
  for (const [field, min, max, message] of numericRules) {
    const candidate = value[field];
    if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate)) {
      errors.push({ field, code: `${field}-integer`, message: 'Enter a finite whole number.' });
    } else if (candidate < min || candidate > max) {
      errors.push({ field, code: `${field}-range`, message });
    }
  }
  if (typeof value.putts === 'number' && Number.isSafeInteger(value.putts)
    && typeof value.strokes === 'number' && Number.isSafeInteger(value.strokes)
    && value.putts >= value.strokes) {
    errors.push({ field: 'putts', code: 'putts-not-below-strokes', message: 'Putts must be fewer than strokes; the tee shot is not a putt.' });
  }
  if (value.fairway === null || value.fairway === undefined) {
    errors.push({ field: 'fairway', code: 'fairway-required', message: value.par === 3 ? 'Fairway must be not applicable for a par 3.' : 'Choose whether you hit or missed the fairway.' });
  } else if (value.fairway !== 'hit' && value.fairway !== 'missed' && value.fairway !== 'n/a') {
    errors.push({ field: 'fairway', code: 'fairway-invalid', message: 'Choose hit, missed, or not applicable.' });
  } else if (value.par === 3 && value.fairway !== 'n/a') {
    errors.push({ field: 'fairway', code: 'fairway-not-applicable', message: 'Fairway must be not applicable for a par 3.' });
  } else if ((value.par === 4 || value.par === 5) && value.fairway === 'n/a') {
    errors.push({ field: 'fairway', code: 'fairway-applicable', message: 'Choose whether you hit or missed the fairway.' });
  }
  return errors;
}
