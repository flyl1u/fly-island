/** Geometry is used for reading order and source highlights, never for text positioning. */
export type OcrDocumentLine = { text: string; x: number; y: number; width: number; height: number };
export type DocumentLine = OcrDocumentLine & { id: number };

export function documentLines(lines: OcrDocumentLine[], width: number, height: number): DocumentLine[] {
  return lines.flatMap((line, id) => {
    if (![line.x, line.y, line.width, line.height].every(Number.isFinite) || line.width <= 0 || line.height <= 0) return [];
    const x = Math.max(0, line.x), y = Math.max(0, line.y);
    const w = Math.min(line.width, width - x), h = Math.min(line.height, height - y);
    return w > 0 && h > 0 ? [{ ...line, id, x, y, width: w, height: h }] : [];
  });
}

export function documentRows<T extends OcrDocumentLine>(lines: T[]): T[][] {
  const rows: T[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - line.y) <= Math.min(last[0].height, line.height) * .4) last.push(line);
    else rows.push([line]);
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x));
}

/** Join fragments of one visual line into ordinary text, without reproducing columns. */
export function naturalTextLines(lines: OcrDocumentLine[]): OcrDocumentLine[] {
  const valid = lines.flatMap((line) => {
    if (![line.x, line.y, line.width, line.height].every(Number.isFinite) || line.width <= 0 || line.height <= 0) return [];
    const parts = line.text.replace(/\r\n?/g, "\n").split("\n");
    return parts.flatMap((text, index) => text.trim() ? [{ ...line, text: text.trim(),
      y: line.y + index * line.height / parts.length, height: line.height / parts.length }] : []);
  });
  return documentRows(valid).map((row) => {
    const x = Math.min(...row.map((line) => line.x)), y = Math.min(...row.map((line) => line.y));
    return { text: row.map((line) => line.text).join(" "), x, y,
      width: Math.max(...row.map((line) => line.x + line.width)) - x,
      height: Math.max(...row.map((line) => line.y + line.height)) - y };
  });
}

export function documentPlainText(lines: DocumentLine[]): string {
  return documentRows(lines).flatMap((row) => row.map((line) => line.text)).join("\n");
}
