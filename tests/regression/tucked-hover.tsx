// pnpm dev, then open /tests/regression/tucked-hover.html?test=1.
// Drives the island's real navigation hooks with the native hover event mocked:
// what resting the cursor on a tucked island does, per the expand trigger (tuckedHover.ts).
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { ISLAND_HOVER_CHANGED_EVENT } from "../../src/windows/island/api";
import { useIslandNavigation } from "../../src/windows/island/useIslandNavigation";
import { useRevealOnMessage } from "../../src/windows/island/useIslandAutomation";
import { useTuckPeek } from "../../src/windows/island/useTuckPeek";
import { useTuckMorph } from "../../src/windows/island/useTuckMorph";
import { useTuckedHoverOpen } from "../../src/windows/island/useTuckedHoverOpen";
import { tuckedHoverOpensPanel } from "../../src/windows/island/tuckedHover";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
mockIPC(() => null, { shouldMockEvents: true });

const RETRACT_MS = 120;
const HOVER_DELAY_MS = 0; // The user's setting; opening still waits for the 320 ms slide-out.

type Island = ReturnType<typeof useIslandNavigation>;
let island: Island;
let enter: () => void;
let clickTucked: () => void;
let setOpensPanel: (value: boolean) => void;
let setBrowserHoverDelay: (value: number) => void;
let setClickToOpen: (value: boolean) => void;
let setPreview: (value: boolean) => void;

function Harness() {
  const [opensPanel, changeOpensPanel] = useState(false);
  const [browserHoverDelay, changeBrowserHoverDelay] = useState(0);
  const [clickToOpen, changeClickToOpen] = useState(false);
  const [preview, changePreview] = useState(false);
  const navigation = useIslandNavigation();
  island = navigation;
  const tuckClass = useTuckMorph(navigation.isTucked, "line");
  setOpensPanel = changeOpensPanel;
  setBrowserHoverDelay = changeBrowserHoverDelay;
  setClickToOpen = changeClickToOpen;
  setPreview = changePreview;
  // As useIslandTucking wires them: a message preview reveals the island and holds the peek.
  useRevealOnMessage(preview, navigation.isTucked, navigation.revealForMessage);
  useTuckPeek(navigation.isPeeking && !preview, navigation.endPeek, navigation.peekRetractDelayMs ?? RETRACT_MS);
  const handlers = useTuckedHoverOpen({
    opensPanel: tuckedHoverOpensPanel(opensPanel ? "hover" : "click", false),
    delayMs: HOVER_DELAY_MS,
    hoverDwellDelayMs: browserHoverDelay,
    clickToOpen,
    isPeeking: navigation.isPeeking && navigation.mode === "collapsed",
    onPeek: navigation.peekIsland,
    onOpen: () => navigation.openIslandPage("todo"),
    blocked: false,
    retractsAfterPeek: navigation.retractsAfterPeek,
    resumePeek: navigation.resumePeek,
  });
  enter = handlers.handleHover;
  clickTucked = handlers.handleClick;
  return (
    <p className={tuckClass}>
      mode {navigation.mode} · tucked {String(navigation.isTucked)} · peeking {String(navigation.isPeeking)}{" "}
      <input id="draft" aria-label="draft" />
    </p>
  );
}

createRoot(document.getElementById("fixture")!).render(<StrictMode><Harness /></StrictMode>);

const results = document.getElementById("results")!;
const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const hover = async (inside: boolean) => {
  await act(async () => { await emit(ISLAND_HOVER_CHANGED_EVENT, inside); });
};
/** The cursor arrives on the tucked island: the page's mouseenter, then the native hover event. */
const arrive = async () => {
  await act(async () => enter());
  await hover(true);
};
const state = () => `${island.mode}/${island.isTucked ? "tucked" : "out"}`;

async function runChecks() {
  try {
    await wait(50);

    // Click mode: a minimized island only slides out, and back once the cursor leaves.
    await act(async () => island.minimizeToEdge());
    await arrive();
    await wait(400);
    check(state() === "collapsed/out" && island.isPeeking, "点击展开：鼠标移上去只露出岛屿，不展开面板");
    await hover(false);
    await wait(450);
    check(state() === "collapsed/tucked", "点击展开：鼠标移开后岛屿收回边缘");

    // Hover mode: slides out at once and opens the panel once the cursor stays, one step.
    await act(async () => setOpensPanel(true));
    await arrive();
    check(state() === "collapsed/out", "悬停展开：先立即露出岛屿");
    await wait(200);
    check(state() === "collapsed/out", "悬停展开：露出的动画结束前不展开面板");
    await wait(400);
    check(state() === "expanded/out" && island.isPeeking, "悬停展开：停留后直接展开面板，不用再点，仍记得要收回");
    await hover(false);
    await wait(450);
    check(state() === "collapsed/tucked", "悬停展开：鼠标移开后面板关闭，岛屿收回边缘");

    // Passing over the edge on the way to a browser tab does not open the panel.
    await arrive();
    await wait(40);
    await hover(false);
    await wait(500);
    check(state() === "collapsed/tucked", "鼠标只是划过边缘时不展开面板，岛屿收回");

    // Out and straight back in, before the island slid away: no tucked mouse-enter
    // comes, and the panel still opens.
    await arrive();
    await wait(40);
    await hover(false);
    await wait(50);
    check(state() === "collapsed/out", "快速移出时岛屿还没收回");
    await hover(true);
    await wait(400);
    check(state() === "expanded/out", "快速移出再移入，鼠标停在岛屿上时面板照样展开");
    await hover(false);
    await wait(450);
    check(state() === "collapsed/tucked", "之后移开，面板关闭、岛屿收回");

    // Browser auto-tuck: quick pointer passes do not reveal the island; a full dwell does.
    await act(async () => { setBrowserHoverDelay(2_500); island.tuckIsland(); });
    await arrive();
    await wait(1_000);
    await hover(false);
    await wait(350);
    check(state() === "collapsed/tucked", "浏览器前台时，鼠标短暂停留后离开，岛屿保持贴边");
    await arrive();
    await wait(2_550);
    check(state() === "collapsed/out", "浏览器前台时，鼠标停留达到设定时长后岛屿才露出");
    await wait(350);
    check(state() === "expanded/out", "达到贴边悬停时长后，岛屿按悬停设置展开");
    await hover(false);
    await wait(450);
    await act(async () => { setClickToOpen(true); island.tuckIsland(); });
    await arrive();
    await wait(2_700);
    check(state() === "collapsed/tucked", "点击展开模式下鼠标停留不会展开浏览器贴边岛屿");
    await act(async () => clickTucked());
    await wait(350);
    check(state() === "expanded/out", "点击展开模式下单击贴边岛屿会打开面板");
    await act(async () => { setClickToOpen(false); setBrowserHoverDelay(0); island.minimizeToEdge(); });

    // A draft in the panel keeps it open after the cursor leaves.
    await arrive();
    await wait(400);
    await act(async () => document.querySelector<HTMLInputElement>("#draft")!.focus());
    await hover(false);
    await wait(500);
    check(state() === "expanded/out", "面板里正在输入时，鼠标移开也不收回");
    await act(async () => document.querySelector<HTMLInputElement>("#draft")!.blur());
    await wait(600);
    check(state() === "collapsed/tucked", "输入框失去焦点后再收回");

    // Idle-tucked without "鼠标移开后重新收起": the panel opens and the island stays out.
    await act(async () => island.idleTuck(null));
    await arrive();
    await wait(400);
    await hover(false);
    await wait(450);
    check(state() === "expanded/out", "没开「鼠标移开后重新收起」时，展开后不自动收回");

    // A message on a tucked island: it slides out for the preview and back once it has gone.
    await act(async () => island.tuckIsland());
    await act(async () => setPreview(true));
    await wait(450);
    check(state() === "collapsed/out", "收到消息时岛屿从边缘弹出，预览期间不收回");
    await act(async () => setPreview(false));
    await wait(450);
    check(state() === "collapsed/tucked", "消息预览结束后岛屿收回边缘");
    check(document.querySelector(".island--tuck-line"), "消息、悬停和手动贴边共用细线形变状态");

    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
  }
}

void runChecks();
