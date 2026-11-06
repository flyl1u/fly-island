// Before .github/workflows/publish-sdk.yml publishes the SDK packages: the tag
// (sdk-v<version>) names the version both packages carry, and the generated
// SDK files (pnpm sdk:build) are up to date. The two packages always share a
// version: projects made by create-fly-island-plugin depend on
// fly-island-plugin ^<its own version>.
//
// Usage: node scripts/plugins/check-sdk-release.mjs sdk-v0.2.1
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SDK_PACKAGES = ["packages/fly-island-plugin", "packages/create-fly-island-plugin"];
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** The version a tag names, or null when it is not sdk-v<version>. */
export function versionOfSdkTag(tag) {
  const match = /^sdk-v(.+)$/.exec(tag ?? "");
  return match && VERSION.test(match[1]) ? match[1] : null;
}

/** Problems with releasing `tag` when the packages are at `versions` ({ name: version }); empty when fine. */
export function releaseProblems(tag, versions) {
  const wanted = versionOfSdkTag(tag);
  if (!wanted) return [`"${tag}" is not a tag like sdk-v0.2.1.`];
  return Object.entries(versions)
    .filter(([, version]) => version !== wanted)
    .map(([name, version]) => `${name} is at ${version}, but the tag says ${wanted}; set both packages to ${wanted} first.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const versions = Object.fromEntries(
    SDK_PACKAGES.map((dir) => {
      const manifest = JSON.parse(readFileSync(path.join(root, dir, "package.json"), "utf8"));
      return [manifest.name, manifest.version];
    }),
  );
  const problems = releaseProblems(process.argv[2], versions);
  const build = spawnSync(process.execPath, [path.join(root, "scripts/plugins/build-plugin-sdk.mjs")], { cwd: root, encoding: "utf8" });
  if (build.status !== 0) problems.push(`pnpm sdk:build failed: ${build.stderr || build.stdout}`);
  const diff = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (diff.stdout.trim()) problems.push(`The generated SDK files are not up to date; run pnpm sdk:build and commit:\n${diff.stdout}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`error: ${problem}`);
    process.exit(1);
  }
  console.log(`ok: releasing ${Object.keys(versions).join(" and ")} ${versionOfSdkTag(process.argv[2])}`);
}
