// Update channels on the release side. Stable releases become GitHub's
// "latest" release, which the stable endpoint reads; GitHub never makes a
// pre-release "latest", so stable users never see a beta. The beta channel
// reads the latest.json kept on the BETA_CHANNEL_TAG release, which every
// release (stable or beta) updates unless it already announces a newer version.

export const BETA_CHANNEL_TAG = "beta-channel";

/** 0.3.1-beta.1 and the like. */
export function isPrerelease(version) {
  return /^\d+\.\d+\.\d+-/.test(version);
}

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match) throw new Error(`Not a semantic version: ${version}`);
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split(".") ?? [] };
}

/** Semver precedence: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a, b) {
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  }
  if (!left.pre.length || !right.pre.length) return right.pre.length - left.pre.length;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i];
    const y = right.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) return Number(x) - Number(y);
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** Whether a release of `version` should replace the beta manifest announcing `current`. */
export function shouldUpdateBetaManifest(version, current) {
  return !current || compareVersions(version, current) >= 0;
}
