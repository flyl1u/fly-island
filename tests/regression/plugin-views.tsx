// pnpm dev, then open /tests/regression/plugin-views.html (add ?test=1 for the checks).
// Every plugin page template at the island's width and a narrow one, with long
// texts, empty states and hostile Markdown. IPC is mocked: actions are only logged.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import "../../src/features/plugin-views/PluginViewPage.css";
import { I18nProvider } from "../../src/i18n";
import { DetailTemplate } from "../../src/features/plugin-views/templates/DetailTemplate";
import { FormTemplate } from "../../src/features/plugin-views/templates/FormTemplate";
import { ListTemplate } from "../../src/features/plugin-views/templates/ListTemplate";
import { StatusTemplate } from "../../src/features/plugin-views/templates/StatusTemplate";

const sent: string[] = [];
mockIPC((command, payload) => {
  sent.push(`${command} ${JSON.stringify(payload)}`);
  return null;
});

const long = "A very long title that goes on and on and on to check that it is cut with an ellipsis instead of overflowing 很长很长的中文标题也要被截断";
const hostile = [
  "# Heading",
  "Some **bold**, *italic* and `code`; see [docs](https://example.com/docs).",
  "<script>window.__pluginViewPwned = 1</script>",
  '<img src=x onerror="window.__pluginViewPwned = 2">',
  "[click](javascript:window.__pluginViewPwned=3)",
  '<a href="https://evil.example">raw link</a>',
  '<iframe src="https://evil.example"></iframe>',
  "- item one",
  "- item two",
].join("\n");

const models = {
  list: {
    search: { placeholder: "Filter" },
    groups: [
      { title: "Open", items: [
        { id: "a", title: "Write docs", subtitle: "docs/plugins/README.md", note: "#12", icon: "file-text", checked: false, actions: [{ id: "x", title: "Snooze", icon: "clock" }, { id: "y", title: "Drop" }, { id: "z", title: "Pin" }, { id: "w", title: "Fourth is dropped" }] },
        { id: "b", title: long, subtitle: long, note: "a very long note", checked: true, url: "https://example.com/b" },
      ] },
      { title: "Links", items: [{ id: "c", title: "Bad link", url: "javascript:alert(1)" }] },
    ],
  },
  listEmpty: { items: [], empty: "Nothing to do" },
  detail: { title: long, markdown: hostile, meta: [{ label: "State", value: "open" }, { label: long, value: long }], actions: [{ id: "close", title: "Close issue", icon: "circle-check" }] },
  detailEmpty: {},
  form: { submitTitle: "Save", message: "Changes are kept by the plugin", fields: [
    { key: "repo", type: "string", title: "Repository", value: "TixXin/fly-island" },
    { key: "count", type: "number", title: "How many", min: 1, max: 50, value: 10 },
    { key: "on", type: "boolean", title: long, value: true },
    { key: "sort", type: "select", title: "Sort", options: [{ value: "new", title: "Newest" }, { value: "old", title: "Oldest" }] },
    { key: "note", type: "multiline", title: "Note", description: long },
  ] },
  formEmpty: { fields: [] },
  status: { primary: "24:59", secondary: long, caption: "Round 2 of 4", progress: 0.35, tone: "accent", actions: [{ id: "stop", title: "Stop" }] },
  statusEmpty: {},
};

type Case = { name: string; template: "list" | "detail" | "form" | "status"; model: unknown };
const cases: Case[] = [
  { name: "list", template: "list", model: models.list },
  { name: "list-empty", template: "list", model: models.listEmpty },
  { name: "detail", template: "detail", model: models.detail },
  { name: "detail-empty", template: "detail", model: models.detailEmpty },
  { name: "form", template: "form", model: models.form },
  { name: "form-empty", template: "form", model: models.formEmpty },
  { name: "status", template: "status", model: models.status },
  { name: "status-empty", template: "status", model: models.statusEmpty },
];

function Template({ template, model }: { template: Case["template"]; model: unknown }) {
  const props = { pluginId: "dev.test.views", viewId: "page", model };
  if (template === "list") return <ListTemplate {...props} />;
  if (template === "detail") return <DetailTemplate {...props} />;
  if (template === "form") return <FormTemplate {...props} />;
  return <StatusTemplate {...props} />;
}

function Page() {
  return (
    <div className="cases">
      {cases.flatMap((item) =>
        [520, 300].map((width) => (
          <div className="case" key={`${item.name}-${width}`} data-case={`${item.name}-${width}`}>
            <span>{item.name} · {width}px</span>
            <div style={{ width }}>
              <section className={`plugin-view plugin-view--${item.template}`}>
                <header className="plugin-view__title"><strong>{item.name}</strong><span>regression</span></header>
                <div className="plugin-view__body"><Template template={item.template} model={item.model} /></div>
              </section>
            </div>
          </div>
        )),
      )}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <I18nProvider>
      <Page />
    </I18nProvider>
  </StrictMode>,
);

function check() {
  const results: string[] = [];
  const expect = (name: string, ok: boolean) => results.push(`${ok ? "PASS" : "FAIL"} ${name}`);
  const pwned = (window as unknown as { __pluginViewPwned?: number }).__pluginViewPwned;
  expect("hostile markdown ran no script", pwned === undefined);
  const markdown = document.querySelector('[data-case="detail-520"] .plugin-detail__markdown');
  expect("no script, img or iframe in markdown", markdown !== null && markdown.querySelector("script, img, iframe") === null);
  const links = [...document.querySelectorAll(".plugin-detail__markdown a")].map((link) => link.getAttribute("href"));
  expect("only the https link is a link", links.length > 0 && links.every((href) => href === "https://example.com/docs"));
  expect("only allowed tags", [...(markdown?.querySelectorAll("*") ?? [])].every((node) => ["H3", "H4", "H5", "P", "STRONG", "EM", "CODE", "UL", "OL", "LI", "A", "BR"].includes(node.tagName)));
  expect("at most 3 actions per list item", document.querySelectorAll('[data-case="list-520"] .plugin-list__item:first-of-type .plugin-list__action').length === 3);
  expect("a javascript: item url is not a link", document.querySelectorAll('[data-case="list-520"] .plugin-list__link').length === 1);
  expect("empty list says so", document.querySelector('[data-case="list-empty-300"] .plugin-list__empty')?.textContent === "Nothing to do");
  expect("empty form says so", document.querySelector('[data-case="form-empty-300"] .plugin-form__message') !== null);
  for (const width of [520, 300]) {
    for (const item of cases) {
      const page = document.querySelector<HTMLElement>(`[data-case="${item.name}-${width}"] .plugin-view`);
      expect(`${item.name} at ${width}px does not overflow sideways`, page !== null && page.scrollWidth <= page.clientWidth + 1);
    }
  }
  const title = document.querySelector<HTMLElement>('[data-case="list-300"] .plugin-list__item:nth-of-type(2) .plugin-list__title');
  expect("long titles are cut with an ellipsis", title !== null && title.scrollWidth > title.clientWidth && getComputedStyle(title).textOverflow === "ellipsis");
  const output = document.getElementById("results");
  if (output) output.textContent = `${results.filter((line) => line.startsWith("FAIL")).length === 0 ? "ALL PASS" : "SOME FAILED"}\n${results.join("\n")}`;
}

if (new URLSearchParams(location.search).has("test")) window.setTimeout(check, 500);
