import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { idlePlan } from "../../src/windows/island/idleCollapse.ts";
import * as todoRotation from "../../src/features/todos/todoRotation.ts";
import * as browserTuck from "../../src/windows/island/browserTuck.ts";

const source = ts.transpileModule(
  readFileSync(new URL("../../src/windows/island/useIslandAutomation.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// A deterministic hook clock lets these checks cover long idle periods and cleanup without sleeping.
function mount(name, initialArgs, logDiagnostic = () => {}) {
  let args = initialArgs;
  let now = 0;
  let sequence = 0;
  let cursor = 0;
  let dirty = false;
  let value;
  const slots = [];
  const timers = new Map();
  let pending = [];
  const browserWindow = new EventTarget();
  const removeEventListener = browserWindow.removeEventListener.bind(browserWindow);
  // Node's EventTarget needs an options object to remove capture listeners reliably.
  browserWindow.removeEventListener = (type, listener, capture) =>
    removeEventListener(type, listener, { capture: capture === true });
  browserWindow.setTimeout = (callback, delay) => {
    const id = ++sequence;
    timers.set(id, { at: now + delay, callback });
    return id;
  };
  browserWindow.clearTimeout = id => timers.delete(id);
  const document = { hidden: false };
  const exports = {};
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => {
        const updated = typeof next === "function" ? next(slots[index]) : next;
        if (!Object.is(updated, slots[index])) { slots[index] = updated; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        pending.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const modules = { react, "../../features/todos/todoRotation": todoRotation,
    "../../features/diagnostics/api": { logDiagnostic }, "./browserTuck": browserTuck };
  runInNewContext(source, { exports, require: (path) => modules[path], window: browserWindow, document });
  function render(nextArgs = args) {
    args = nextArgs;
    do {
      dirty = false;
      cursor = 0;
      pending = [];
      value = exports[name](...args);
      pending.forEach(commit => commit());
    } while (dirty);
    return value;
  }
  render();
  return {
    render,
    document,
    get value() { return value; },
    get timerCount() { return timers.size; },
    fire(type) { browserWindow.dispatchEvent(new Event(type)); },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        render();
      }
      now = end;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("task rotation is opt-in, wraps pending tasks, and restores the selected task when disabled", () => {
  const ids = ["a", "b", "c"];
  const app = mount("useTodoRotation", [ids, "b", false, 5, false]);
  assert.equal(app.value, "b");
  assert.equal(app.timerCount, 0);
  app.render([ids, "b", true, 5, false]);
  app.tick(4_999);
  assert.equal(app.value, "b");
  app.tick(1);
  assert.equal(app.value, "c");
  app.tick(5_000);
  assert.equal(app.value, "a");
  app.render([ids, "b", false, 5, false]);
  assert.equal(app.value, "b");
  assert.equal(app.timerCount, 0);
});

test("rotation pauses while hidden by panels or previews and handles selection, removal and empty lists", () => {
  const ids = ["a", "b", "c"];
  const app = mount("useTodoRotation", [ids, null, true, 2, false]);
  assert.equal(app.value, "a");
  app.tick(2_000);
  assert.equal(app.value, "b");
  app.render([ids, null, true, 2, true]);
  app.tick(20_000);
  assert.equal(app.value, "b");
  app.render([ids, null, true, 3, false]);
  app.tick(2_999);
  assert.equal(app.value, "b");
  app.tick(1);
  assert.equal(app.value, "c");
  app.render([ids, "a", true, 3, false]);
  assert.equal(app.value, "a");
  app.render([["c"], "a", true, 3, false]);
  assert.equal(app.value, "c");
  assert.equal(app.timerCount, 0);
  app.render([[], null, true, 3, false]);
  assert.equal(app.value, null);
  app.unmount();
});

test("idle tucking is opt-in and activity, page changes and duration edits restart the countdown", () => {
  let tucks = 0;
  const tuck = () => { tucks++; };
  const app = mount("useIdleTuck", [false, 3, false, "collapsed:todo", tuck]);
  app.tick(30_000);
  assert.equal(tucks, 0);
  app.render([true, 3, false, "collapsed:todo", tuck]);
  for (const event of ["pointermove", "keydown", "wheel", "input"]) {
    app.tick(2_000);
    app.fire(event);
    assert.equal(tucks, 0);
  }
  app.render([true, 2, false, "expanded:layout", tuck]);
  app.tick(1_999);
  assert.equal(tucks, 0);
  app.tick(1);
  assert.equal(tucks, 1);
  app.render([true, 2, true, "collapsed:layout", tuck]);
  app.tick(10_000);
  assert.equal(tucks, 1);
  assert.equal(app.timerCount, 0);
});

test("idle tucking waits for drag and IME completion and cleans up when disabled or unmounted", () => {
  let tucks = 0;
  const tuck = () => { tucks++; };
  const app = mount("useIdleTuck", [true, 2, false, "expanded:todo", tuck]);
  app.fire("pointerdown");
  app.tick(20_000);
  assert.equal(tucks, 0);
  app.fire("pointerup");
  app.tick(1_000);
  app.fire("compositionstart");
  app.tick(20_000);
  assert.equal(tucks, 0);
  app.fire("compositionend");
  app.tick(1_999);
  assert.equal(tucks, 0);
  app.tick(1);
  assert.equal(tucks, 1);
  app.render([false, 2, false, "expanded:todo", tuck]);
  app.fire("pointermove");
  assert.equal(app.timerCount, 0);
  app.render([true, 2, false, "expanded:todo", tuck]);
  app.document.hidden = true;
  app.fire("visibilitychange");
  app.tick(20_000);
  assert.equal(tucks, 1);
  app.document.hidden = false;
  app.fire("visibilitychange");
  app.unmount();
  app.fire("pointermove");
  app.tick(20_000);
  assert.equal(tucks, 1);
  assert.equal(app.timerCount, 0);
});

test("ending a keep-visible activity restarts the full idle wait and never reveals a tucked island", () => {
  let tucks = 0;
  const tuck = () => { tucks++; };
  const settings = { autoTuck: true, tuckDelaySeconds: 30, autoCollapseSeconds: 5 };
  const args = (keepVisible, isTucked = false) => {
    const plan = idlePlan("collapsed", settings, false, false, keepVisible);
    return [plan !== null, plan?.seconds ?? 0, isTucked, "collapsed:todo", tuck];
  };
  const app = mount("useIdleTuck", args(false));
  app.tick(29_000);
  app.render(args(true));
  app.tick(60_000);
  assert.equal(tucks, 0);
  app.render(args(false));
  app.tick(29_999);
  assert.equal(tucks, 0);
  app.tick(1);
  assert.equal(tucks, 1);
  app.render(args(true, true));
  assert.equal(app.timerCount, 0);
  app.tick(60_000);
  assert.equal(tucks, 1);
  app.unmount();
});

function mountBrowser(overrides = {}) {
  const decisions = [];
  const state = {
    enabled: true, browserOnIslandMonitor: false, isTucked: false, tuckSource: null,
    isHovering: false, gameHolds: false, hasMessagePreview: false, isPreviewing: false, ...overrides,
  };
  const tuck = () => Object.assign(state, { isTucked: true, tuckSource: "browser" });
  const reveal = () => Object.assign(state, { isTucked: false, tuckSource: null });
  const app = mount("useBrowserAutoTuck", [{ ...state }, tuck, reveal], (_category, name, { reason }) => {
    assert.equal(name, "browser_auto_tuck");
    decisions.push(reason);
  });
  return {
    decisions, state,
    change(update = {}) {
      Object.assign(state, update);
      app.render([{ ...state }, tuck, reveal]);
      app.render([{ ...state }, tuck, reveal]);
    },
  };
}

test("browser takes over idle tucks but never undoes a manual tuck or peek", () => {
  const app = mountBrowser({ isTucked: true, tuckSource: "idle" });
  app.change({ browserOnIslandMonitor: true });
  assert.equal(app.state.tuckSource, "browser");
  app.change({ browserOnIslandMonitor: false });
  assert.equal(app.state.isTucked, false);

  app.change({ isTucked: true, tuckSource: "manual", browserOnIslandMonitor: true });
  app.change({ isTucked: false });
  assert.equal(app.state.tuckSource, "manual");
  app.change({ isTucked: true, browserOnIslandMonitor: false });
  assert.equal(app.state.isTucked, true);
  assert.deepEqual(app.decisions, ["took_over_idle_tuck", "tucked", "revealed_browser_left", "skipped_already_tucked"]);
});

test("browser retries after previews, waits through hover, and logs only changed decisions", () => {
  const app = mountBrowser({ hasMessagePreview: true, isPreviewing: true });
  app.change({ browserOnIslandMonitor: true });
  app.change();
  app.change({ isPreviewing: false });
  assert.equal(app.state.isTucked, false);
  app.change({ hasMessagePreview: false, isHovering: true });
  assert.equal(app.state.isTucked, false);
  app.change({ isHovering: false });
  assert.equal(app.state.isTucked, true);
  app.change({ isTucked: false, isHovering: true });
  app.change({ isHovering: false });
  assert.equal(app.state.isTucked, true);
  assert.deepEqual(app.decisions, ["blocked_settings_preview", "blocked_message_preview", "waiting_hover", "tucked", "waiting_hover", "tucked"]);
});

test("browser waits out game mode, releases its own peek on disable, and honors manual takeover", () => {
  const app = mountBrowser({ gameHolds: true });
  app.change({ browserOnIslandMonitor: true });
  assert.equal(app.state.isTucked, false);
  app.change({ gameHolds: false });
  assert.equal(app.state.isTucked, true);
  app.change({ gameHolds: true, browserOnIslandMonitor: false });
  assert.equal(app.state.isTucked, true);
  app.change({ gameHolds: false });
  assert.equal(app.state.isTucked, false);
  app.change({ browserOnIslandMonitor: true });
  app.change({ isTucked: false, isHovering: true, enabled: false });
  assert.equal(app.state.tuckSource, null);
  app.change({ enabled: true, isHovering: false });
  app.change({ tuckSource: "manual" });
  app.change({ enabled: false });
  assert.equal(app.state.isTucked, true);
  assert.equal(app.state.tuckSource, "manual");
});
