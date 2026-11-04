/**
 * Compares dot-separated versions by number, like `version_at_least` in
 * src-tauri/src/plugin_host/manifest.rs: missing parts count as 0 and anything
 * after `-` or `+` is ignored. Returns true when `candidate` is newer than `current`.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parts = (version: string) =>
    (version.split(/[-+]/)[0] ?? "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const next = parts(candidate);
  const installed = parts(current);
  for (let index = 0; index < Math.max(next.length, installed.length); index += 1) {
    const difference = (next[index] ?? 0) - (installed[index] ?? 0);
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return false;
}
