import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { PluginAuthors } from "../../src/features/plugins/PluginAuthors";
import { githubAvatarUrl, loadAuthorAvatar } from "../../src/features/plugins/authorAvatarCache";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const author = { name: "flyliu", url: "https://github.com/flyl1u" };
const source = githubAvatarUrl(author.url)!;
const live = new URLSearchParams(location.search).has("live");
const originalFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async (input, options) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("https://avatars.githubusercontent.com/")) return originalFetch(input, options);
  requests += 1;
  if (live) return originalFetch(input, options);
  if (url.includes("offline-example")) throw new Error("offline fixture");
  return new Response(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="10" fill="#639d7c"/></svg>'], { type: "image/svg+xml" }));
};

function Page() {
  const [visible, setVisible] = useState(true);
  return <>
    <button id="toggle" type="button" onClick={() => setVisible(!visible)}>Toggle market</button>
    {visible && <><PluginAuthors authors={[author]} label="Authors" /><PluginAuthors authors={[author]} label="Authors" /></>}
  </>;
}

const root = createRoot(document.getElementById("fixture")!);
const results = document.getElementById("results")!;
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  results.textContent += `PASS ${message}\n`;
};
try {
  await act(async () => root.render(<StrictMode><Page /></StrictMode>));
  await act(async () => { await loadAuthorAvatar(source); });
  if (!live) {
    const avatars = () => [...document.querySelectorAll<HTMLImageElement>(".plugin-author__avatar")];
    const cached = avatars()[0]?.src;
    check(requests === 1 && avatars().length === 2 && avatars().every((image) => image.src === cached && image.naturalWidth > 0), "Two mounted author rows share one decoded avatar request");
    const toggle = () => act(async () => document.getElementById("toggle")!.click());
    await toggle();
    check(avatars().length === 0, "Leaving the market unmounts the avatars");
    await toggle();
    check(requests === 1 && avatars().length === 2 && avatars().every((image) => image.src === cached), "Reentering mounts cached blob URLs immediately, without another network request");
    await act(async () => avatars().forEach((image) => image.dispatchEvent(new Event("error"))));
    check(document.querySelectorAll(".plugin-author__avatar--fallback").length === 2, "An image failure shows initials");
    const offline = { name: "Offline", url: "https://github.com/offline-example" };
    await act(async () => root.render(<PluginAuthors authors={[offline]} label="Authors" />));
    await act(async () => { await loadAuthorAvatar(githubAvatarUrl(offline.url)!); });
    check(document.querySelector(".plugin-author__avatar--fallback")?.textContent === "O", "Offline first visits retain a visible fallback");
    document.documentElement.dataset.testResult = "passed";
  }
} catch (error) {
  results.textContent += `FAIL ${String(error)}`;
  document.documentElement.dataset.testResult = "failed";
}
