/** Known DSH hosts retain a compact label and the shared DS fallback icon. */
type DshHosts = { official: string; desktop: string; dataelement: string; anywhere: string };
export function dshHostLabel(name: string, labels?: DshHosts): string | null {
  if (name === "DeepSeek Harness" || name === "DSH") return labels?.official ?? "DSH";
  if (name === "DSH Desktop (dataelement)") return labels?.dataelement ?? name;
  if (name === "DSH Desktop (anywhere)") return labels?.anywhere ?? name;
  if (name === "DSH Desktop") return labels?.desktop ?? name;
  return null;
}
