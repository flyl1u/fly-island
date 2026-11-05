// claude-code-merge-queue: agent lanes (../fly-island-lanes/N) and the landing
// queue. Workflow in AGENTS.md, "Git 与协作".
export default {
  // All lanes in one sibling folder instead of a fly-island-lane-N folder each.
  // Needs patches/claude-code-merge-queue@0.7.1.patch to be found and pruned.
  worktreeSuffix: "-lanes/",
  integrationBranch: "main",
  // Builds from before c3aaf55 read the plugin market from dev; onLand keeps it
  // at the landed commit instead of a separate promote step.
  productionBranch: null,
  // Each lane gets its own `pnpm install` (cheap with pnpm's store); a symlinked
  // node_modules needs Developer Mode on Windows. Installing works on Windows
  // only with patches/claude-code-merge-queue@0.7.1.patch.
  symlinks: [],
  installOnCreate: true,
  regenerableFiles: [],
  buildOutputDirs: ["dist", "src-tauri/target"],
  checkCommand: "node scripts/land-check.mjs",
  onLand: "node scripts/land-sync-dev.mjs",
};
