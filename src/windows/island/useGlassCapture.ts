import { useEffect } from "react";
import { Channel, isTauri } from "@tauri-apps/api/core";
import { setGlassCaptureRegion, startGlassCapture, stopGlassCapture } from "./api";
import { backdropLuma, glassFramePlacement, parseGlassFrame } from "./glassFrame";

const PLACEMENT = ["--glass-frame-x", "--glass-frame-y", "--glass-frame-width", "--glass-frame-height", "--glass-backdrop-luma"];

function hideBackdrop(root: HTMLElement) {
  delete root.dataset.glassBackdrop;
}

/** Writes only a changed value: an unchanged frame then costs no style work at all. */
function writeVariable(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
}

/**
 * The glass materials' live backdrop (src-tauri/src/island/glass_capture.rs): what is behind
 * the island, blurred by `blur` (0–100), drawn on a canvas under the pane. Rust sends frames only
 * when something behind the island changed, at most 30 a second; each one is put straight on the
 * canvas and its place written to the root as CSS variables, with no React render. Without a
 * frame (paused, unsupported, failed) `data-glass-backdrop` is absent and the glass is a tint.
 *
 * The capture covers the whole window, so the island lies inside it whatever its size: a region cut
 * to the open page's height left a bright untinted band under a taller page or a grown message, and
 * its bottom edge jumped as the height changed. `--glass-backdrop-luma` (0–1) tells IslandGlass.css
 * how bright the backdrop is, so the tint can deepen until the text reads over it. These are
 * written on the backdrop box itself, the only place that reads them, and only when they change:
 * written on the root at up to 30 frames a second, each change restyled the whole window, which
 * showed as stutter while a video played behind the island (2026-11-18, owner).
 * `paused` (tucked) stops the capture without giving up the channel.
 */
export function useGlassCapture(enabled: boolean, paused: boolean, blur: number) {
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled || !isTauri()) {
      hideBackdrop(root);
      return;
    }
    let didCancel = false;
    const channel = new Channel<ArrayBuffer | number[]>();
    let canvas: HTMLCanvasElement | null = null;
    let host: HTMLElement | null = null;
    channel.onmessage = (data) => {
      if (didCancel) return;
      const frame = parseGlassFrame(data);
      if (!frame) {
        hideBackdrop(root);
        return;
      }
      canvas = canvas?.isConnected ? canvas : document.querySelector<HTMLCanvasElement>(".island__glass-backdrop canvas");
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      if (canvas.width !== frame.width) canvas.width = frame.width;
      if (canvas.height !== frame.height) canvas.height = frame.height;
      context.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
      host = canvas.parentElement;
      if (host) {
        for (const [name, value] of Object.entries(glassFramePlacement(frame, window.devicePixelRatio))) writeVariable(host, name, value);
        writeVariable(host, "--glass-backdrop-luma", String(backdropLuma(frame)));
      }
      if (root.dataset.glassBackdrop !== "live") root.dataset.glassBackdrop = "live";
    };
    void startGlassCapture(channel)
      .then((supported) => {
        if (didCancel) return;
        if (!supported) console.warn("Glass capture unsupported: the island cannot be left out of Desktop Duplication");
      })
      .catch((error) => console.warn("Glass capture unavailable", error));
    return () => {
      didCancel = true;
      hideBackdrop(root);
      for (const name of PLACEMENT) host?.style.removeProperty(name);
      void stopGlassCapture().catch(() => {});
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    const ratio = window.devicePixelRatio || 1;
    const region = paused ? null : {
      left: 0,
      top: 0,
      width: Math.round(window.innerWidth * ratio),
      height: Math.round(window.innerHeight * ratio),
    };
    void setGlassCaptureRegion(region, blur).catch(() => {});
  }, [enabled, paused, blur]);
}
