export type ImageTextLine = { text: string; x: number; y: number; width: number; height: number };
export type TranslatedImageLine = ImageTextLine & { translated: string; error: string | null };

/** A bounded queue keeps large screenshots from flooding the configured provider. */
export async function translateImageLines(
  lines: ImageTextLine[],
  translate: (text: string) => Promise<string>,
  onLine: (index: number, result: TranslatedImageLine) => void,
  cancelled: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (!cancelled() && next < lines.length) {
      const index = next++;
      const line = lines[index];
      let translated = "";
      let error: string | null = null;
      try {
        translated = (await translate(line.text)).trim();
        if (!translated) error = "";
      } catch (cause) {
        error = String(cause);
      }
      if (!cancelled()) onLine(index, { ...line, translated, error });
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, lines.length) }, worker));
}
