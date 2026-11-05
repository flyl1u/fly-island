import { useEffect, useRef } from "react";
import { useLocale } from "../../../i18n";
import { hidePluginWebview, showPluginWebview, type PluginWebviewBounds } from "../api";
import "./WebviewTemplate.css";

/** How long after the page opens or resizes its position is checked every frame (the island animates meanwhile). */
const FOLLOW_MS = 900;

const sameBounds = (a: PluginWebviewBounds | null, b: PluginWebviewBounds) =>
  a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * The webview template (P8): a box on the island that the plugin's own page
 * covers. The page itself is a separate native WebView2 (not part of this
 * window) that the island places over the box, so here we only report where
 * the box is, and close the page when the box goes away.
 */
export function WebviewTemplate({ pluginId, viewId, active }: { pluginId: string; viewId: string; active: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // Given to the page when it is created; another language applies the next time it opens.
  const { locale } = useLocale();
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    const element = box.current;
    if (!active || !element) return;
    let sent: PluginWebviewBounds | null = null;
    let frame = 0;
    let followUntil = 0;
    const report = () => {
      const rect = element.getBoundingClientRect();
      const bounds = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      if (sameBounds(sent, bounds)) return;
      sent = bounds;
      showPluginWebview(pluginId, viewId, bounds, localeRef.current).catch((error: unknown) => console.error("Failed to show a plugin page", error));
    };
    const follow = (now: number) => {
      report();
      frame = now < followUntil ? requestAnimationFrame(follow) : 0;
    };
    const startFollowing = () => {
      followUntil = performance.now() + FOLLOW_MS;
      if (frame === 0) frame = requestAnimationFrame(follow);
    };
    startFollowing();
    const observer = new ResizeObserver(startFollowing);
    observer.observe(element);
    window.addEventListener("resize", startFollowing);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", startFollowing);
      hidePluginWebview(pluginId, viewId).catch((error: unknown) => console.error("Failed to close a plugin page", error));
    };
  }, [active, pluginId, viewId]);

  return <div ref={box} className="plugin-webview" />;
}
