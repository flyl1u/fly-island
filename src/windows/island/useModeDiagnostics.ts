import { useCallback, useEffect, useRef } from "react";
import { logDiagnostic } from "../../features/diagnostics/api";
import { diagnosticMode, type IslandModeReason } from "./diagnosticMode";
import type { IslandMode } from "./types";

export function useModeDiagnostics(mode: IslandMode, tucked: boolean, peeking: boolean) {
  const actual = diagnosticMode(mode, tucked, peeking);
  const previous = useRef<typeof actual | "none">("none");
  const intent = useRef<IslandModeReason>("launch");
  const mark = useCallback((reason: IslandModeReason = "click") => {
    intent.current = typeof reason === "string" ? reason : "click";
  }, []);

  useEffect(() => {
    if (previous.current === actual) return;
    logDiagnostic("island", "mode", { reason: intent.current, from: previous.current, to: actual });
    previous.current = actual;
  }, [actual]);

  return mark;
}
