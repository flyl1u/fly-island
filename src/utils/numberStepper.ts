/** Whole-number input shared by settings and compact island controls. */
export function clampStepperValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseStepperInput(input: string, current: number, min: number, max: number): number {
  if (!/^\d+$/.test(input)) return current;
  const value = Number(input);
  return Number.isFinite(value) ? clampStepperValue(value, min, max) : current;
}

export function stepStepperValue(value: number, direction: number, step: number, min: number, max: number): number {
  return clampStepperValue(value + direction * step, min, max);
}
