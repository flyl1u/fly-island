import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { copyScreenshotText, destroyPinnedImage, pinnedImageSrc, pinOcrLines, revealPinnedImage } from "../../features/screenshot/api";
import { documentLines, documentPlainText, naturalTextLines, type OcrDocumentLine } from "../../features/screenshot/ocrDocument";

export function useOcrDocument() {
  const label = getCurrentWindow().label;
  const [src, setSrc] = useState("");
  const [rows, setRows] = useState<OcrDocumentLine[]>([]);
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const job = useRef<Promise<OcrDocumentLine[]> | null>(null);
  const revealed = useRef(false);
  const reveal = () => {
    if (revealed.current) return;
    revealed.current = true;
    void revealPinnedImage(label).catch((cause) => setError(String(cause)));
  };
  useEffect(() => {
    let alive = true;
    void pinnedImageSrc(label).then((path) => { if (alive) setSrc(convertFileSrc(path)); })
      .catch((cause) => { if (alive) setError(String(cause)); });
    job.current ??= pinOcrLines(label).then(naturalTextLines);
    void job.current.then((lines) => { if (alive) setRows(lines); })
      .catch((cause) => { if (alive) setError(String(cause)); })
      .finally(() => { if (alive) setBusy(false); });
    const timer = window.setTimeout(() => {
      if (!revealed.current) { revealed.current = true; void revealPinnedImage(label).catch(() => {}); }
    }, 1500);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [label]);
  const lines = documentLines(rows, natural.width, natural.height);
  const edit = (id: number, text: string) => {
    setRows((list) => list.map((line, index) => index === id ? { ...line, text } : line));
    setCopied(false);
  };
  const copy = async () => {
    try {
      await copyScreenshotText(documentPlainText(lines));
      setCopied(true);
    } catch (cause) { setError(String(cause)); }
  };
  const close = () => void destroyPinnedImage(label).catch((cause) => setError(String(cause)));
  return { src, lines, natural, setNatural, busy, error, copied, edit, copy, close, reveal, setError };
}
