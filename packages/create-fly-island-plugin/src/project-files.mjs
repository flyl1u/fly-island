// Everything in a new plugin folder besides its main file: manifest, ignore
// files, README, LICENSE, package.json / tsconfig.json and the GitHub workflow.

// An empty activationEvents makes a plugin start only when its commands or
// views are used (they imply onCommand / onView) and stop when idle.
const CONTRIBUTIONS = {
  blank: { contributes: {} },
  command: {
    activationEvents: [],
    contributes: { commands: [{ id: "hello", title: { "zh-CN": "打个招呼", en: "Say hello" } }] },
    permissions: ["island:notify"],
  },
  list: {
    activationEvents: [],
    contributes: {
      commands: [{ id: "add", title: { "zh-CN": "添加一项", en: "Add an item" } }],
      views: [{ id: "main", title: { "zh-CN": "清单", en: "List" }, icon: "list-checks", template: "list" }],
    },
  },
  status: {
    contributes: { statusItems: [{ id: "open", priority: 0 }] },
    permissions: ["todos:read"],
    activationEvents: ["onStartupFinished"],
  },
};

const ENTRY = { powershell: "main.ps1", javascript: "main.mjs", typescript: "dist/main.mjs" };
const RUNS_ON = {
  powershell: { "zh-CN": "用 Windows 自带的 PowerShell 运行。", en: "Runs on the PowerShell built into Windows." },
  javascript: { "zh-CN": "需要安装 Node.js。", en: "Needs Node.js." },
  typescript: { "zh-CN": "需要安装 Node.js。", en: "Needs Node.js." },
};

export function manifest(options) {
  const parts = CONTRIBUTIONS[options.template];
  return {
    id: options.id,
    name: options.name,
    description: {
      "zh-CN": `${options.name["zh-CN"]}。${RUNS_ON[options.language]["zh-CN"]}`,
      en: `${options.name.en}. ${RUNS_ON[options.language].en}`,
    },
    version: "0.1.0",
    apiVersion: 2,
    author: options.author,
    homepage: options.homepage,
    runtime: { type: "process", command: ENTRY[options.language] },
    permissions: parts.permissions ?? [],
    ...(parts.activationEvents ? { activationEvents: parts.activationEvents } : {}),
    contributes: parts.contributes,
  };
}

export function focusdIgnore(options) {
  const lines = ["# Left out of the plugin's zip (fly-island-plugin pack).", ".github/", ".gitignore", "test/", "node_modules/", "package.json", "package-lock.json"];
  if (options.language === "typescript") lines.push("src/", "tsconfig.json");
  return `${lines.join("\n")}\n`;
}

export function gitIgnore(options) {
  return `${["node_modules/", ".package/", ...(options.language === "typescript" ? ["dist/"] : [])].join("\n")}\n`;
}

export function packageJson(options) {
  const typescript = options.language === "typescript";
  const build = typescript ? "tsc && " : "";
  return `${JSON.stringify(
    {
      name: options.id.replaceAll(".", "-"),
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        ...(typescript ? { build: "tsc", watch: "tsc --watch" } : {}),
        dev: "fly-island-plugin dev",
        validate: `${build}fly-island-plugin validate`,
        test: `${build}fly-island-plugin test`,
        pack: `${build}fly-island-plugin pack`,
      },
      devDependencies: {
        "fly-island-plugin": `^${options.sdkVersion}`,
        ...(typescript ? { typescript: "^5.8.3" } : {}),
      },
    },
    null,
    2,
  )}\n`;
}

export function tsconfig() {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        rootDir: "src",
        outDir: "dist",
        types: [],
        skipLibCheck: true,
      },
      include: ["src"],
    },
    null,
    2,
  )}\n`;
}

export function workflow(options) {
  const install = options.language === "powershell" ? "" : "      - run: npm install\n";
  const build = options.language === "typescript" ? "      - run: npm run build\n" : "";
  const cli = options.language === "powershell" ? "npx --yes fly-island-plugin@latest" : "npx fly-island-plugin";
  return `# Checks the plugin on every push, and publishes a GitHub release with the
# package when you push a tag equal to "version" in focusd-plugin.json (e.g. 0.1.0).
name: plugin
on:
  push:
    branches: [main]
    tags: ["[0-9]+.[0-9]+.[0-9]+*"]
  pull_request:
permissions:
  contents: write
jobs:
  check:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
${install}${build}      - run: ${cli} validate
      - run: ${cli} test
      - run: ${cli} pack
      - name: Release
        if: startsWith(github.ref, 'refs/tags/')
        shell: bash
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          version=$(node -p "require('./focusd-plugin.json').version")
          test "$version" = "\${{ github.ref_name }}" || { echo "The tag must equal version $version"; exit 1; }
          gh release create "\${{ github.ref_name }}" .package/*.zip --title "\${{ github.ref_name }}" --generate-notes
`;
}

export function readme(options) {
  const node = options.language !== "powershell";
  const steps = [
    ...(node ? ["npm install"] : []),
    ...(options.language === "typescript" ? ["npm run watch          # in a second terminal: compiles src/ to dist/"] : []),
    "npx fly-island-plugin dev    # loads this folder into the island, restarts on changes",
    "npx fly-island-plugin test   # runs the plugin under the mock host",
    "npx fly-island-plugin pack   # writes .package/<id>-<version>.zip",
  ];
  return `# ${options.name.en}

${options.name["zh-CN"]}: a [FocuSD Island](https://github.com/TixXin/fly-island) plugin.

## Develop

1. In FocuSD Island, open Settings > Plugins: turn on the **Local API** plugin, then
   **Developer > development mode**.
2. In this folder:

\`\`\`sh
${steps.join("\n")}
\`\`\`

The plugin API: <https://github.com/TixXin/fly-island/blob/main/docs/plugins/README.md>.

## Publish

Push a tag equal to \`version\` in \`focusd-plugin.json\` (for example \`0.1.0\`); the
workflow in \`.github/workflows/plugin.yml\` checks the plugin and attaches the
package to a GitHub release.
`;
}

export function license(options) {
  return `MIT License

Copyright (c) ${new Date().getFullYear()} ${options.author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}
