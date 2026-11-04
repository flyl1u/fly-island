import { useCallback, useEffect, useState } from "react";
import {
  answerPluginPermission,
  listenPluginPermissionRequests,
  type PluginPermissionAnswer,
  type PluginPermissionRequest,
} from "./api";

export type PluginPermissionPrompts = {
  /** The prompt shown now; others wait behind it. */
  current: PluginPermissionRequest | null;
  answer: (answer: PluginPermissionAnswer) => void;
};

/**
 * Sensitive-permission questions from plugins, one at a time. A question drops
 * out when its time is up, since Rust has refused the call by then.
 */
export function usePluginPermissionPrompts(): PluginPermissionPrompts {
  const [queue, setQueue] = useState<(PluginPermissionRequest & { expiresAt: number })[]>([]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenPluginPermissionRequests((request) => {
      setQueue((current) => [...current, { ...request, expiresAt: Date.now() + request.timeoutMs }]);
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) => console.error("Failed to listen for plugin permission requests", error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(
      () => setQueue((items) => items.filter((item) => item.requestId !== current.requestId)),
      Math.max(0, current.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [current]);

  const answer = useCallback(
    (choice: PluginPermissionAnswer) => {
      if (!current) return;
      setQueue((items) => items.filter((item) => item.requestId !== current.requestId));
      void answerPluginPermission(current.requestId, choice).catch((error: unknown) =>
        console.error("Failed to answer a plugin permission request", error),
      );
    },
    [current],
  );

  return { current, answer };
}
