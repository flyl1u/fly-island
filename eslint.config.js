import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// IPC 只能在各目录的 api.ts 中出现（规则见 src/AGENTS.md「边界收口」）。
const ipcImportRestriction = {
  paths: [
    {
      name: "@tauri-apps/api/core",
      importNames: ["invoke"],
      message: "invoke 只能在 api.ts 中使用，请通过对应目录的 api.ts 调用。",
    },
    {
      name: "@tauri-apps/api/event",
      importNames: ["listen"],
      message: "listen 只能在 api.ts 中使用，请通过对应目录的 api.ts 订阅。",
    },
  ],
};

// 重构前就直接调用 invoke / listen 的文件。迁移到 api.ts 后从这里删除；清空后见 refactor-plan.md 7.2。
const legacyIpcFiles = [
  "src/App.tsx",
  "src/SettingsWindow.tsx",
  "src/TranslationWindow.tsx",
  "src/updaterController.ts",
];

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src-tauri/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-imports": ["error", ipcImportRestriction],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/^@tauri-apps\\u002Fapi\\u002F(core|event)$/]",
          message: "不要用动态 import 绕过 api.ts 的 IPC 收口。",
        },
      ],
    },
  },
  {
    files: ["src/**/api.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },
  {
    files: legacyIpcFiles,
    rules: {
      "no-restricted-imports": ["warn", ipcImportRestriction],
    },
  },
  {
    // utils/ 只放纯函数：不依赖 React、Tauri。
    files: ["src/utils/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react/*", "react-dom", "react-dom/*"], message: "utils/ 不得依赖 React。" },
            { group: ["@tauri-apps/*"], message: "utils/ 不得依赖 Tauri。" },
          ],
        },
      ],
    },
  },
);
