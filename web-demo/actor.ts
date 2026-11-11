// The demo's pretend mouse: it moves to a control, presses it and types into fields, with the
// island's own handlers doing the rest. Its clicks and keystrokes are synthetic (isTrusted false), so
// they never count as the visitor taking over (see tour.ts).

/** The tour was interrupted: the visitor took over, paused it, or the page went away. */
export class Interrupted extends Error {}

/** The tour's clock: waits only run while the demo is on screen and not interrupted. */
export type Clock = { token: number; current: () => number; held: () => boolean };

const MOVE_MS = 560;
const SETTLE_MS = 160;

type Target = string | (() => Element | null | undefined);

function nativeSetter(element: HTMLInputElement | HTMLTextAreaElement) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
}

export function createActor(cursor: HTMLElement, clock: Clock) {
  const check = () => {
    if (clock.current() !== clock.token) throw new Interrupted();
  };

  /** Waits `ms` of visible time: the count stops while the demo is scrolled away or the tab hidden. */
  const wait = async (ms: number) => {
    let left = ms;
    while (left > 0) {
      check();
      const step = Math.min(left, 100);
      await new Promise((resolve) => setTimeout(resolve, step));
      if (!clock.held()) left -= step;
    }
    check();
  };

  const find = async (target: Target, within = 1600) => {
    for (let waited = 0; waited <= within; waited += 100) {
      check();
      const element = typeof target === "string" ? document.querySelector(target) : target();
      if (element instanceof HTMLElement && element.getClientRects().length > 0) return element;
      await wait(100);
    }
    return null;
  };

  const moveTo = async (element: HTMLElement, align: "center" | "start" = "center") => {
    const box = element.getBoundingClientRect();
    const x = align === "start" ? box.left + Math.min(28, box.width / 2) : box.left + box.width / 2;
    const y = box.top + box.height / 2;
    cursor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    await wait(MOVE_MS + SETTLE_MS);
  };

  const press = async () => {
    cursor.dataset.pressed = "true";
    const ripple = document.createElement("span");
    ripple.className = "demo-cursor__ripple";
    cursor.append(ripple);
    setTimeout(() => ripple.remove(), 600);
    await wait(130);
    delete cursor.dataset.pressed;
  };

  return {
    wait,
    find,
    /** Moves to the control and clicks it. Resolves false when the control isn't there. */
    async click(target: Target, align: "center" | "start" = "center") {
      const element = await find(target);
      if (!element) return false;
      await moveTo(element, align);
      await press();
      check();
      element.click();
      return true;
    },
    /** Clicks into a field and types the text one character at a time. */
    async type(target: Target, text: string) {
      const field = await find(target);
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return false;
      await moveTo(field, "start");
      await press();
      field.focus();
      const set = nativeSetter(field);
      set.call(field, "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      for (const character of text) {
        await wait(55 + Math.random() * 60);
        set.call(field, field.value + character);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return true;
    },
    /** Presses a key in the focused field (Enter to submit). */
    async key(target: Target, key: string) {
      const field = await find(target, 0);
      if (!field) return;
      await wait(260);
      field.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
      if (key === "Enter") field.closest("form")?.requestSubmit();
    },
    /** Moves out of the way, below the island, without clicking. */
    async rest() {
      const island = document.querySelector(".island")?.getBoundingClientRect();
      if (!island) return;
      cursor.style.transform = `translate(${Math.round(island.right + 36)}px, ${Math.round(island.bottom + 40)}px)`;
      await wait(MOVE_MS);
    },
  };
}

export type Actor = ReturnType<typeof createActor>;
