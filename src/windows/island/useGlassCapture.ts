import { useEffect } from "react";
import { Channel, isTauri } from "@tauri-apps/api/core";
import { setGlassCaptureRegion, startGlassCapture, stopGlassCapture } from "./api";
import { glassFramePlacement, parseGlassFrame } from "./glassFrame";

const PLACEMENT = ["--glass-frame-x", "--glass-frame-y", "--glass-frame-width", "--glass-frame-height"];

function hideBackdrop(root: HTMLElement) {
  delete root.dataset.glassBackdrop;
}

/**
 * The glass materials' live backdrop (src-tauri/src/island/glass_capture.rs): what is behind
 * the island, blurred by `blur` (0–100), drawn on a canvas under the pane. Rust sends frames only
 * when something behind the island changed, at most 30 a second; each one is put straight on the
 * canvas and its place written to the root as CSS variables, with no React render. Without a
 * frame (paused, unsupported, failed) `data-glass-backdrop` is absent and the glass is a tint.
 *
 * `regionHeight` is the open island's height in CSS px: the capture covers the window's width
 * down to there, so the collapsed bar and the open island both lie inside it as the shape moves.
 * `paused` (tucked) stops the capture without giving up the channel.
 */
export function useGlassCapture(enabled: boolean, paused: boolean, regionHeight: number, blur: number) {
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled || !isTauri()) {
      hideBackdrop(root);
      return;
    }
    let didCancel = false;
    const channel = new Channel<ArrayBuffer | number[]>();
    let canvas: HTMLCanvasElement | null = null;
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
      for (const [name, value] of Object.entries(glassFramePlacement(frame, window.devicePixelRatio))) root.style.setProperty(name, value);
      root.dataset.glassBackdrop = "live";
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
      for (const name of PLACEMENT) root.style.removeProperty(name);
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
      height: Math.round(Math.min(window.innerHeight, regionHeight) * ratio),
    };
    void setGlassCaptureRegion(region, blur).catch(() => {});
  }, [enabled, paused, regionHeight, blur]);
}
