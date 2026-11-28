import { act } from "react";

/** Card name key → the GitHub logins its authors link to, in the order they must show. */
const CONTRIBUTED: Readonly<Record<string, string>> = {
  telegram: "baiyu0111",
  codebuddy: "yiumanlenong",
  antigravity: "lilipeng0615-cyber",
  calendarMarks: "gyl-coding",
  battery: "QXiaoLingShang",
  relay: "yiumanlenong",
  centeredClock: "SeanWang114514",
  appleMusicLyrics: "YTC0408",
  screenshot: "Philipfanw",
  minimax: "YTC0408",
  "device-battery": "Anobod1119",
  "eye-care": "zloghs",
};

/**
 * Each card's authors: the contributor first and flyliu second, linked to GitHub, with their avatars
 * and the initial-letter fallback. The error is dispatched here, so no network is involved.
 */
export async function checkPluginAuthors(
  cards: HTMLElement[],
  items: Readonly<Record<string, { name: string }>>,
  listLabel: string,
  check: (condition: unknown, message: string) => void,
) {
  const idByName = new Map(Object.entries(items).map(([id, item]) => [item.name, id]));
  const wrong = cards.filter((card) => {
    const contributor = CONTRIBUTED[idByName.get(card.querySelector("h3")?.textContent ?? "") ?? ""];
    const expected = contributor ? [contributor, "flyl1u"] : ["flyl1u"];
    const list = card.querySelector(`ul[aria-label='${listLabel}']`);
    const links = [...(list?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
    const names = links.map((link) => link.querySelector(".plugin-author__name")?.textContent);
    return links.map((link) => link.getAttribute("href")).join() !== expected.map((login) => `https://github.com/${login}`).join()
      || names.join() !== expected.map((login) => login === "flyl1u" ? "flyliu" : login).join();
  });
  check(cards.length > 0 && wrong.length === 0, "Cards list the contributor first and flyliu second, each linked to GitHub; our own list flyliu once");

  const oneLine = () => [...document.querySelectorAll<HTMLElement>(".plugin-card .plugin-authors")].every((row) => {
    const tops = [...row.children].map((item) => item.getBoundingClientRect().top);
    const names = [...row.querySelectorAll<HTMLElement>(".plugin-author__name")];
    const hidden = names.filter((name) => name.offsetWidth === 0).length;
    return new Set(tops).size === 1 && row.scrollWidth <= row.clientWidth && (hidden === 0 || hidden === names.length);
  });
  const namesShown = (id: string) => {
    const card = cards.find((item) => item.querySelector("h3")?.textContent === items[id].name);
    return card?.querySelector<HTMLElement>(".plugin-author__name")?.offsetWidth !== 0;
  };
  // Resize observers report after the next layout, so give them two frames.
  const settle = () => act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
  });
  const fixture = document.getElementById("fixture")!;
  const wideOk = oneLine() && namesShown("antigravity");
  fixture.style.width = "168px";
  await settle();
  check(wideOk && oneLine() && !namesShown("antigravity") && namesShown("dingtalk"),
    "Authors stay on one line; a crowded row shows avatars alone and a short one keeps the name");
  fixture.style.width = "";
  await settle();
  check(namesShown("antigravity"), "A card with room again shows the names again");

  const avatars = [...document.querySelectorAll<HTMLImageElement>(".plugin-card img.plugin-author__avatar")];
  check(avatars.every((avatar) => avatar.src.startsWith("blob:") && !avatar.hasAttribute("loading")),
    "Decoded avatars use shared local blob URLs without reloading lazily on every market visit");
  await act(async () => { avatars.forEach((avatar) => avatar.dispatchEvent(new Event("error"))); });
  const fallbacks = [...document.querySelectorAll<HTMLElement>(".plugin-card .plugin-author")];
  check(!document.querySelector(".plugin-card img.plugin-author__avatar") && fallbacks.every((link) => {
    const circle = link.querySelector(".plugin-author__avatar--fallback");
    const name = link.querySelector(".plugin-author__name")?.textContent ?? "";
    return circle?.textContent === name.charAt(0).toUpperCase();
  }), "An avatar that cannot load becomes the initial letter, never a broken image");
}
