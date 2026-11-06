// pnpm dev, then open /tests/regression/tucked-hover.html?test=1.
// Drives the island's real navigation hooks with the native hover event mocked:
// what resting the cursor on a tucked island does, per the "收起时鼠标移上去" setting.
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { ISLAND_HOVER_CHANGED_EVENT } from "../../src/windows/island/api";
import { useIslandNavigation } from "../../src/windows/island/useIslandNavigation";
import { useTuckPeek } from "../../src/windows/island/useTuckPeek";
import { useTuckedHoverOpen } from "../../src/windows/island/useTuckedHoverOpen";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
mockIPC(() => null, { shouldMockEvents: true });

const RETRACT_MS = 120;
const HOVER_DELAY_MS = 0; // The user's setting; opening still waits for the 320 ms slide-out.

type Island = ReturnType<typeof useIslandNavigation>;
let island: Island;
let enter: () => void;
let setOpensPanel: (value: boolean) => void;

function Harness() {
  const [opensPanel, changeOpensPanel] = useState(false);
  const navigation = useIslandNavigation();
  island = navigation;
  setOpensPanel = changeOpensPanel;
  useTuckPeek(navigation.isPeeking, navigation.endPeek, navigation.peekRetractDelayMs ?? RETRACT_MS);
  enter = useTuckedHoverOpen({
    opensPanel,
    delayMs: HOVER_DELAY_MS,
    onPeek: navigation.peekIsland,
    onOpen: () => navigation.openIslandPage("todo"),
    retractsAfterPeek: navigation.retractsAfterPeek,
    resumePeek: navigation.resumePeek,
  });
  return (
    <p>
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

    // "只露出岛屿": a minimized island only slides out, and back once the cursor leaves.
    await act(async () => island.minimizeToEdge());
    await arrive();
    await wait(400);
    check(state() === "collapsed/out" && island.isPeeking, "只露出岛屿：鼠标移上去只露出岛屿，不展开面板");
    await hover(false);
    await wait(450);
    check(state() === "collapsed/tucked", "只露出岛屿：鼠标移开后岛屿收回边缘");

    // "展开面板": slides out at once, opens once the cursor stays.
    await act(async () => setOpensPanel(true));
    await arrive();
    check(state() === "collapsed/out", "展开面板：先立即露出岛屿");
    await wait(200);
    check(state() === "collapsed/out", "展开面板：露出的动画结束前不展开面板");
    await wait(400);
    check(state() === "expanded/out" && island.isPeeking, "展开面板：停留后展开面板，仍记得要收回");
    await hover(false);
    await wait(450);
    check(state() === "collapsed/tucked", "展开面板：鼠标移开后面板关闭，岛屿收回边缘");

    // Passing over the edge on the way to a browser tab does not open the panel.
    await arrive();
    await wait(40);
    await hover(false);
    await wait(500);
    check(state() === "collapsed/tucked", "鼠标只是划过边缘时不展开面板，岛屿收回");

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

    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
  }
}

void runChecks();
