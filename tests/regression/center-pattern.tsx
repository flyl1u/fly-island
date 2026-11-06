// pnpm dev, then open /tests/regression/center-pattern.html (?test=1 runs the checks).
// Real pets for visual QA: copy ~/.codex/pets/<id>/ into node_modules/.cache/codex-pets/
// and add ?pets=chispa,doraemon (or &petsBase=<url> for another folder Vite serves).
import { act, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import { CenterPattern } from "../../src/features/center-pattern/CenterPattern";
import { PetSprite } from "../../src/features/center-pattern/PetSprite";
import { ISLAND_CURSOR_MOVED_EVENT } from "../../src/features/center-pattern/api";
import { CENTER_PATTERNS, type CenterPatternId, type PetMood } from "../../src/features/center-pattern/patterns";
import type { AgentActivity } from "../../src/features/center-pattern";
import type { AgentSessionSummary } from "../../src/features/agent-status/api";
import { useCollapsedSlots } from "../../src/windows/island/useCollapsedSlots";
import "../../src/windows/island/IslandCollapsedBar.css";

const MOODS: PetMood[] = ["idle", "running", "waiting", "failed", "done"];
const params = new URLSearchParams(location.search);
const petsBase = params.get("petsBase") ?? "/node_modules/.cache/codex-pets";
const petIds = (params.get("pets") ?? "").split(",").filter(Boolean);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const trackingCalls: boolean[] = [];
// The built-in plugin as list_plugins reports it; the slot use cases swap its settings.
let centerPlugin = { enabled: true, settings: { pattern: "eyes", pet: "" } as Record<string, unknown> };
mockIPC((command, payload) => {
  if (command === "set_island_cursor_tracking") trackingCalls.push(Boolean((payload as { enabled?: boolean }).enabled));
  if (command === "list_plugins")
    return { plugins: [{ id: "focusd.center-pattern", builtin: true, status: "running", ...centerPlugin }] };
  if (command === "get_pet_spritesheet") {
    const id = (payload as { id: string }).id;
    if (id === "synthetic") return SHEET;
    if (petIds.includes(id)) return `${petsBase}/${id}/spritesheet.webp`;
    throw new Error(`no pet ${id}`);
  }
}, { shouldMockEvents: true });
mockWindows("main");

/** A petdex-sized sheet (8×9 cells of 192×208) with each cell numbered, drawn on a canvas. */
function syntheticSheet(rows = 9): string {
  const canvas = document.createElement("canvas");
  canvas.width = 8 * 192;
  canvas.height = rows * 208;
  const context = canvas.getContext("2d")!;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      context.fillStyle = `hsl(${row * 40} 70% ${col % 2 ? 62 : 74}%)`;
      context.beginPath();
      context.arc(col * 192 + 96, row * 208 + 104, 80, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#111";
      context.font = "bold 90px sans-serif";
      context.textAlign = "center";
      context.fillText(String(col), col * 192 + 96, row * 208 + 136);
    }
  }
  return canvas.toDataURL("image/png");
}

const SHEET = syntheticSheet();
const fixture = document.getElementById("fixture")!;
const results = document.getElementById("results")!;
const messages: string[] = [];
const root = createRoot(fixture);

// Stable, so the slots are not rebuilt on every render.
const NO_SESSIONS: AgentSessionSummary[] = [];
const NO_UNSEEN: ReadonlySet<string> = new Set();
const NO_OP = () => {};

/** The collapsed bar's center slot as useCollapsedSlots fills it from the plugin's settings. */
function Slot({ agents = [], paused = false }: { agents?: AgentActivity[]; paused?: boolean }) {
  const slots = useCollapsedSlots({ paused, agents, sessions: NO_SESSIONS, unseen: NO_UNSEEN, agentsOn: false, onOpenAgents: NO_OP });
  return <div className="cp-island cp-slot">
    {slots.center ? <span className="island__center-slot">{slots.center}</span> : null}
    {slots.agentIcon ? <span className="cp-agent-icon">{slots.agentIcon}</span> : null}
  </div>;
}

function Gallery({ paused, mood }: { paused: boolean; mood?: PetMood }) {
  const pets = petIds.length ? petIds.map((id) => ({ id, src: `${petsBase}/${id}/spritesheet.webp` })) : [{ id: "synthetic", src: SHEET }];
  return (
    <>
      <section className="cp-section">
        <h2>内置图案（折叠岛 38px 高，图案 22px）</h2>
        <div className="cp-row">
          {CENTER_PATTERNS.map((pattern: CenterPatternId) => (
            <div className="cp-cell" key={pattern} data-cell={pattern}>
              <div className="cp-island"><CenterPattern pattern={pattern} paused={paused} /></div>
              {pattern}
            </div>
          ))}
        </div>
      </section>
      <section className="cp-section">
        <h2>放大 3 倍</h2>
        <div className="cp-row cp-zoom" style={{ justifyContent: "center" }}>
          {CENTER_PATTERNS.map((pattern) => (
            <div className="cp-island cp-small" key={pattern}><CenterPattern pattern={pattern} paused={paused} /></div>
          ))}
        </div>
      </section>
      {pets.map((pet) => (
        <section className="cp-section" key={pet.id}>
          <h2>宠物 {pet.id}：idle / running / waiting / failed / done</h2>
          <div className="cp-row">
            {(mood ? [mood] : MOODS).map((petMood) => (
              <div className="cp-cell" key={petMood}>
                <div className="cp-island cp-small"><PetSprite src={pet.src} mood={petMood} paused={paused} /></div>
                {petMood}
              </div>
            ))}
            <div className="cp-cell">
              <div className="cp-island cp-small" style={{ height: 76 }}><PetSprite src={pet.src} mood="running" height={66} paused={paused} /></div>
              running 66px
            </div>
          </div>
        </section>
      ))}
    </>
  );
}

const render = async (node: ReactNode) => {
  await act(async () => {
    root.render(<StrictMode>{node}</StrictMode>);
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};
const waitFor = async (check: () => boolean, label: string) => {
  for (let i = 0; i < 100 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  if (!check()) throw new Error(label);
};

async function runChecks() {

  const pass = (label: string) => messages.push(`PASS ${label}`);
  const expect = (ok: boolean, label: string) => { if (!ok) throw new Error(label); pass(label); };
  const slotWith = async (settings: Record<string, unknown>, agents: AgentActivity[] = [], enabled = true) => {
    centerPlugin = { enabled, settings };
    await render(<Slot key={JSON.stringify([settings, agents, enabled])} agents={agents} />);
  };

  await slotWith({ pattern: "bird", pet: "" });
  await waitFor(() => fixture.querySelector(".cp-slot [data-pattern=bird]") !== null, "槽位显示所选图案");
  pass("插件启用时折叠栏中心槽位显示所选图案（小鸟）");
  await slotWith({ pattern: "pet", pet: "synthetic" }, [{ phase: "waiting", updatedAt: Date.now() }]);
  await waitFor(() => fixture.querySelector(".cp-slot .pet-sprite") !== null, "槽位显示宠物");
  const slotPet = fixture.querySelector<HTMLElement>(".cp-slot .pet-sprite")!;
  expect(slotPet.dataset.mood === "waiting" && Math.round(slotPet.getBoundingClientRect().height) === 28, "槽位宠物 28px 高，有会话等待确认时演 waiting");
  const iconPet = fixture.querySelector<HTMLElement>(".cp-agent-icon .pet-sprite");
  expect(iconPet?.dataset.mood === "waiting" && Math.round(iconPet.getBoundingClientRect().height) === 18 && iconPet.getBoundingClientRect().width < 17,
    "选宠物时同时给出 Agent 标题前的图标：18px 高、不比 16px 图标占位宽多少，跟随 mood");
  await slotWith({ pattern: "pet", pet: "gone" });
  await waitFor(() => fixture.querySelector(".cp-slot [data-pattern=eyes]") !== null, "宠物读不到时退回眼睛");
  pass("宠物不存在或读取失败时退回眼睛，不留空白");
  expect(!fixture.querySelector(".cp-agent-icon"), "宠物读不到时不替换 Agent 图标");
  await slotWith({ pattern: "bird", pet: "" });
  await waitFor(() => fixture.querySelector(".cp-slot [data-pattern=bird]") !== null, "内置图案");
  expect(!fixture.querySelector(".cp-agent-icon"), "内置 SVG 图案不替换 Agent 图标");
  await slotWith({ pattern: "cat", pet: "" }, [], false);
  expect(fixture.querySelector(".cp-slot")!.childElementCount === 0, "插件关闭时不填槽位");

  await render(<Gallery paused={false} />);
  for (const pattern of CENTER_PATTERNS) {
    const box = fixture.querySelector(`[data-cell="${pattern}"] svg`)!.getBoundingClientRect();
    expect(Math.round(box.height) === 22 && box.width > 10 && box.width <= 60, `${pattern} 高 22px、宽不超过 60px（${box.width.toFixed(1)}px）`);
  }
  const bird = fixture.querySelector(".center-bird-body")!;
  expect(getComputedStyle(bird).animationName === (reducedMotion ? "none" : "center-bird-peck"), reducedMotion ? "减弱动态时小鸟不动" : "小鸟在播放啄食动画");

  // Pet sprite: the row and the frame steps.
  const sprite = fixture.querySelector<HTMLElement>(".pet-sprite")!;
  await waitFor(() => sprite.dataset.ready !== undefined, "宠物图集加载后才显示");
  await waitFor(() => getComputedStyle(sprite).opacity === "1", "宠物加载后完全不透明");
  pass("合成图集（8×9）加载后显示");
  const rowOf = (element: Element) => new DOMMatrix(getComputedStyle(element.querySelector(".pet-sprite-row")!).transform).m42;
  const sprites = Array.from(fixture.querySelectorAll<HTMLElement>(".pet-sprite")).slice(0, 5);
  const expectedRows = [0, 7, 6, 5, 3];
  sprites.forEach((element, index) => {
    const sheetHeight = element.querySelector("img")!.getBoundingClientRect().height;
    expect(Math.abs(rowOf(element) + (expectedRows[index] / 9) * sheetHeight) < 0.5, `${MOODS[index]} 显示第 ${expectedRows[index]} 行`);
  });
  const sheetStyle = getComputedStyle(sprites[1].querySelector("img")!);
  expect(reducedMotion ? sheetStyle.animationName === "none" : /steps\(6/.test(sheetStyle.animationTimingFunction), reducedMotion ? "减弱动态时停在第一帧" : "running 按 6 帧 steps() 播放");
  const frame = sprites[0].getBoundingClientRect();
  expect(Math.round(frame.height) === 22 && Math.abs(frame.width - (22 * 192) / 208) < 0.5, "一帧按 192:208 缩放到 22px 高");

  // A sheet that is not a petdex grid stays hidden.
  await render(<PetSprite src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" mood="idle" />);
  const invalidSheet = fixture.querySelector<HTMLImageElement>(".pet-sprite img")!;
  await waitFor(() => invalidSheet.complete, "无效图片加载完成");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(fixture.querySelector<HTMLElement>(".pet-sprite")!.dataset.ready === undefined, "不是 8×9 / 8×11 网格的图片不显示");

  // Eyes: in-window mouse moves and the native cursor event.
  trackingCalls.length = 0;
  await render(<CenterPattern pattern="eyes" />);
  const pupil = fixture.querySelector<SVGGElement>(".center-eyes-pupil")!;
  if (reducedMotion) {
    expect(pupil.style.transform === "" && trackingCalls.length === 0, "减弱动态时眼睛不跟随、不请求光标事件");
  } else {
    expect(trackingCalls[trackingCalls.length - 1] === true, "显示眼睛时请求原生光标事件");
    const eye = fixture.querySelector(".center-eyes-white")!.getBoundingClientRect();
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: eye.right + 400, clientY: eye.top + eye.height / 2 }));
    expect(/translate\(2\.6px, 0px\)/.test(pupil.style.transform), `窗口内鼠标在右边时瞳孔看向右边（${pupil.style.transform}）`);
    await act(async () => { await emit(ISLAND_CURSOR_MOVED_EVENT, { x: eye.left - 400, y: eye.bottom + 400 }); });
    expect(/translate\(-1\.\d+px, 1\.\d+px\)/.test(pupil.style.transform), `窗口外光标在左下时瞳孔看向左下（${pupil.style.transform}）`);
    await render(<CenterPattern pattern="eyes" paused />);
    expect(trackingCalls[trackingCalls.length - 1] === false, "暂停后关闭原生光标事件");

    // Two eyes share the native switch: it stays on until the last one goes.
    trackingCalls.length = 0;
    await render(<><CenterPattern pattern="eyes" /><CenterPattern pattern="eyes" /></>);
    expect(trackingCalls[trackingCalls.length - 1] === true, "两双眼睛时原生光标事件开启");
    const callsWithTwo = trackingCalls.length;
    await render(<CenterPattern pattern="eyes" />);
    expect(trackingCalls.length === callsWithTwo, "去掉一双后不关闭原生光标事件");
    await render(<CenterPattern pattern="cat" />);
    expect(trackingCalls[trackingCalls.length - 1] === false, "最后一双去掉后才关闭");

    // Another window (a settings preview) only follows its own mousemove.
    mockWindows("settings");
    trackingCalls.length = 0;
    await render(<CenterPattern pattern="eyes" />);
    const previewPupil = fixture.querySelector<SVGGElement>(".center-eyes-pupil")!;
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 0 }));
    expect(trackingCalls.length === 0 && previewPupil.style.transform !== "", "设置窗口里的眼睛不请求原生光标事件，只跟随窗口内鼠标");
    mockWindows("main");
  }
  await render(<CenterPattern pattern="cat" paused />);
  const cat = fixture.querySelector(".center-cat-eye")!;
  expect(reducedMotion || getComputedStyle(cat).animationPlayState === "paused", "暂停时动画停住");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
}

if (params.has("test")) {
  runChecks().catch((error: unknown) => {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
  });
} else {
  if (params.has("slot")) {
    centerPlugin.settings = { pattern: params.get("slot") || "eyes", pet: params.get("pet") ?? "synthetic" };
    void render(<Slot agents={params.has("waiting") ? [{ phase: "waiting", updatedAt: Date.now() }] : []} />);
  } else void render(<Gallery paused={params.has("paused")} mood={(params.get("mood") as PetMood) || undefined} />);
  results.textContent = `prefers-reduced-motion: ${reducedMotion ? "reduce" : "no-preference"}。?paused 暂停，?mood=running 只看一个状态，?slot=pet&pet=<id> 看折叠栏槽位。`;
}
