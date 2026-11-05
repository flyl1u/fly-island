// claude-code-merge-queue: agent lanes (../fly-island-lane-N) and the landing
// queue. Workflow in AGENTS.md, "Git 与协作".
export default {
  integrationBranch: "main",
  // Builds from before c3aaf55 read the plugin market from dev; onLand keeps it
  // at the landed commit instead of a separate promote step.
  productionBranch: null,
  // Each lane runs `pnpm install` itself: the tool's own install calls `pnpm`
  // without a shell, which fails on Windows (pnpm is a .cmd), and a symlinked
  // node_modules needs Developer Mode.
  symlinks: [],
  installOnCreate: false,
  regenerableFiles: [],
  buildOutputDirs: ["dist", "src-tauri/target"],
  checkCommand: "node scripts/land-check.mjs",
  onLand: "node scripts/land-sync-dev.mjs",
};
