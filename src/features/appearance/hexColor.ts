/** Accept the compact forms people type, but persist only canonical #RRGGBB. */
export function parseHexColor(value: string): string | null {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${[...hex].map((digit) => digit + digit).join("").toUpperCase()}`;
  }
  return null;
}

export function resolveHexColor(value: string, original: string): string {
  return parseHexColor(value) ?? original;
}
