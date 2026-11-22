/** Number input shared by settings and compact island controls. */
export function clampStepperValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseStepperInput(input: string, current: number, min: number, max: number, precision = 0): number {
  const valid = precision > 0 ? /^\d*(?:\.\d*)?$/.test(input) && input !== "" && input !== "." : /^\d+$/.test(input);
  if (!valid) return current;
  const value = Number(input);
  return Number.isFinite(value) ? Number(clampStepperValue(value, min, max).toFixed(precision)) : current;
}

export function stepStepperValue(value: number, direction: number, step: number, min: number, max: number): number {
  const precision = String(step).split(".")[1]?.length ?? 0;
  return Number(clampStepperValue(value + direction * step, min, max).toFixed(precision));
}
