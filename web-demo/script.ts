// What the demo does on each page, in order. Each segment first brings up its page the way a person
// would (open the island, click the page's button), so the tour can resume from any segment after
// the visitor has been clicking around.
import type { IslandPage } from "../src/windows/island/types";
import type { Actor } from "./actor";
import type { DemoContent } from "./demoData";

export const PAGE_BUTTONS: Record<IslandPage, string> = {
  todo: ".dot-button--todo",
  music: ".dot-button--music",
  clipboard: ".dot-button--clipboard",
  shelf: ".dot-button--shelf",
  qq: ".island-message-button",
  translation: ".island-translate-button",
  agents: ".island__agent-button",
  settings: ".island-settings-button",
};

export type Segment = { page: IslandPage; run: (actor: Actor, data: DemoContent) => Promise<void> };

const island = () => document.querySelector(".island");
const isExpanded = () => Boolean(island()?.classList.contains("island--expanded"));
const isOn = (page: IslandPage) => isExpanded() && Boolean(island()?.classList.contains(`island--${page}`));

/** Opens the island on `page` by clicking, as a person would. */
export async function enter(actor: Actor, page: IslandPage) {
  if (!isExpanded()) {
    await actor.click(".island__open-button");
    await actor.wait(700);
  }
  if (!isOn(page)) {
    await actor.click(PAGE_BUTTONS[page]);
    await actor.wait(650);
  }
}

const todoRow = (title: string) =>
  [...document.querySelectorAll<HTMLElement>(".todo-item, [role='listitem']")].find((row) => row.querySelector(".todo-title")?.textContent === title);

export const segments: Segment[] = [
  {
    page: "todo",
    async run(actor, data) {
      await enter(actor, "todo");
      // A later round: take the task off the list again first, so the list stays the same length.
      const old = todoRow(data.tour.todo);
      if (old) {
        await actor.click(() => todoRow(data.tour.todo)?.querySelector(".todo-delete"));
        if (todoRow(data.tour.todo)) await actor.click(() => todoRow(data.tour.todo)?.querySelector(".todo-delete"));
        await actor.wait(500);
      }
      await actor.type(".todo-form input", data.tour.todo);
      await actor.key(".todo-form input", "Enter");
      await actor.wait(900);
      // Starting a task tucks the island away with the task shown on it.
      await actor.click(() => todoRow(data.tour.todo)?.querySelector(".todo-start"));
      await actor.wait(500);
      await actor.rest();
      await actor.wait(2400);
    },
  },
  {
    page: "clipboard",
    async run(actor, data) {
      await enter(actor, "clipboard");
      await actor.type(".clipboard-search input", data.tour.search);
      await actor.wait(1500);
      await actor.click(".clipboard-search button");
      await actor.wait(500);
      await actor.click(".clipboard-item:nth-child(3) .clipboard-favorite-button");
      await actor.wait(700);
      await actor.click(".clipboard-item:nth-child(1) .clipboard-copy-button");
      await actor.wait(1500);
    },
  },
  {
    page: "music",
    async run(actor) {
      await enter(actor, "music");
      await actor.rest();
      await actor.wait(1800);
      await actor.click(".music-control-button--primary");
      await actor.wait(1100);
      await actor.click(".music-player__controls .music-control-button:last-child");
      await actor.rest();
      await actor.wait(2600);
    },
  },
  {
    page: "qq",
    async run(actor) {
      await enter(actor, "qq");
      await actor.wait(1500);
      await actor.click(".message-sources button:last-child");
      await actor.wait(800);
      if (await actor.click(".qq-mail-item button")) {
        await actor.rest();
        await actor.wait(3000);
        await actor.click(".qq-mail-back");
        await actor.wait(700);
      }
      await actor.click(".message-sources button:first-child");
      await actor.wait(900);
    },
  },
  {
    page: "translation",
    async run(actor, data) {
      await enter(actor, "translation");
      await actor.type(".island__content textarea", data.tour.translate);
      await actor.key(".island__content textarea", "Enter");
      await actor.rest();
      await actor.wait(2600);
    },
  },
  {
    page: "agents",
    async run(actor) {
      await enter(actor, "agents");
      await actor.rest();
      await actor.wait(3400);
      // The middle of the top bar tucks the island away, as on the desktop.
      await actor.click(".island__collapse-target");
      await actor.rest();
      await actor.wait(2600);
    },
  },
];

/** The segment to continue with after the visitor has been looking at `page`. */
export function segmentAfter(page: IslandPage | null) {
  const index = segments.findIndex((segment) => segment.page === page);
  return index === -1 ? 0 : (index + 1) % segments.length;
}
