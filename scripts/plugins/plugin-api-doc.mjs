// docs/plugins/api.md: the plugin protocol reference, written from
// plugins/schema/rpc.json by `pnpm sdk:build` (see build-plugin-sdk.mjs).

const cell = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const code = (value) => `\`${value}\``;

function params(value) {
  if (value === null || value === undefined) return "无";
  if (typeof value === "string") return cell(value);
  return Object.entries(value)
    .map(([key, text]) => `${code(key)}：${cell(text)}`)
    .join("<br>");
}

function table(head, rows) {
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

export function apiReference(rpc) {
  const permission = (name) => (name ? code(name) : "无");
  const sensitive = new Set(rpc.permissions.filter((item) => item.sensitive).map((item) => item.name));
  return `# 插件 API 参考

> 由 \`pnpm sdk:build\` 根据 [\`plugins/schema/rpc.json\`](../../plugins/schema/rpc.json) 生成，不要手改。说明和示例见 [README.md](README.md)，上手见 [快速开始](quickstart.md)。

插件和岛屿通过 stdin / stdout 交换 JSON-RPC 2.0 消息，每行一条。“版本”是引入该项的插件 API 版本（清单 \`apiVersion\`）；岛屿支持第 ${rpc.apiVersions.min}–${rpc.apiVersions.current} 版。

## 能力（\`initialize.capabilities\`）

${table(["能力", "版本", "含义"], rpc.capabilities.map((item) => [code(item.name), item.since, cell(item.meaning)]))}

## 权限

敏感权限第一次使用时要用户在岛上确认，拒绝时返回 \`-32001\`。

${table(["权限", "版本", "敏感"], rpc.permissions.map((item) => [code(item.name), item.since, sensitive.has(item.name) ? "是" : ""]))}

## 插件调用的方法

${table(["方法", "权限", "版本", "参数", "结果"], rpc.methods.map((item) => [code(item.name), permission(item.permission), item.since, params(item.params), cell(item.result)]))}

## 事件（\`events.subscribe\`）

${table(["事件", "权限", "版本", "载荷"], rpc.events.map((item) => [code(item.name), permission(item.permission), item.since, cell(item.payload)]))}

## 岛屿发给插件的通知

${table(["通知", "版本", "参数"], rpc.toPlugin.map((item) => [code(item.name), item.since, params(item.params)]))}

## 插件发给岛屿的通知

${table(["通知", "版本", "参数"], rpc.fromPlugin.map((item) => [code(item.name), item.since, params(item.params)]))}

## 错误码

${table(["代码", "含义"], rpc.errors.map((item) => [code(item.code), cell(item.meaning)]))}
`;
}
