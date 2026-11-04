export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function getColorSetting(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value)
    ? value
    : fallback;
}
