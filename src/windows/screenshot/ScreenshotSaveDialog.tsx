// 保存图像弹窗：预览 + 保存位置/文件名/格式/尺寸 + 系统保存对话框入口。
import { useEffect, useMemo, useState } from "react";
import { join, downloadDir } from "@tauri-apps/api/path";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, ImageDown, LockKeyhole, UnlockKeyhole, RotateCcw, X } from "lucide-react";
import { saveScreenshotPng, saveScreenshotPngTo } from "../../features/screenshot/api";
import { useTranslation } from "../../i18n";
import "./ScreenshotSaveDialog.css";

type Props = {
  /** 标注合成后的 PNG（base64，无 data URI 前缀）。 */
  png: string;
  onDone: (path: string) => void;
  onClose: () => void;
};

const FORMATS = ["png", "jpg"] as const;
type Format = (typeof FORMATS)[number];

/** data URI 交给浏览器解码，尺寸从图片本身读。 */
function usePngSize(png: string) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const image = new Image();
    image.onload = () => setSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = `data:image/png;base64,${png}`;
  }, [png]);
  return size;
}

export function ScreenshotSaveDialog({ png, onDone, onClose }: Props) {
  const { screenshot: t } = useTranslation();
  const original = usePngSize(png);
  const stamp = useMemo(() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  }, []);
  const [name, setName] = useState(`FlyIsland_${stamp}`);
  const [format, setFormat] = useState<Format>("png");
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [locked, setLocked] = useState(true);
  const [folder, setFolder] = useState("");
  // 默认落到用户下载目录（Windows 上通常是 C:\Users\<用户>\Downloads）。
  useEffect(() => { void downloadDir().then(setFolder).catch(() => {}); }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (original.width && !width) {
      setWidth(original.width);
      setHeight(original.height);
    }
  }, [original, width, height]);

  const validName = !!name.trim() && !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
  const validSize = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    && width <= 16384 && height <= 16384 && width * height <= 64_000_000;
  const estimate = `${Math.max(1, Math.round((png.length * 3) / 4 / 1024 * (width && original.width ? (width / original.width) ** 2 : 1)))} KB`;

  const pickFolder = async () => {
    const picked = await openDialog({ title: t.saveChooseFolder, directory: true, multiple: false });
    if (picked) setFolder(String(picked));
  };

  const writeImage = async (path: string, resize = true) => {
    setBusy(true);
    setError("");
    try {
      let payload = png;
      if (resize && width && height && (width !== original.width || height !== original.height)) {
        // 缩放用离屏 canvas：只在用户真的改了尺寸时做。
        const result = await new Promise<string>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) { reject(new Error("canvas unavailable")); return; }
            context.drawImage(image, 0, 0, width, height);
            resolve(canvas.toDataURL("image/png").split(",")[1] ?? "");
          };
          image.onerror = () => reject(new Error("image decode failed"));
          image.src = `data:image/png;base64,${png}`;
        });
        payload = result;
      }
      const saved = path ? await saveScreenshotPngTo(payload, path) : await saveScreenshotPng(payload);
      onDone(saved);
    } catch (cause) {
      setError(t.saveFailed(String(cause)));
    } finally {
      setBusy(false);
    }
  };

  const onQuickSave = () => void (async () => {
    if (!validName) { setError(t.invalidFileName); return; }
    const path = await saveDialog({ title: t.saveTitle,
      defaultPath: await join(folder, `${name}.${format}`),
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (path) await writeImage(path);
  })().catch((cause) => setError(t.saveFailed(String(cause))));
  const onSystemDialog = async () => {
    const path = await saveDialog({
      title: t.saveTitle,
      defaultPath: `${name}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (path) void writeImage(String(path));
  };

  const onWidth = (value: number) => {
    setWidth(value);
    if (locked && original.width) setHeight(Math.max(1, Math.round(value * original.height / original.width)));
  };
  const onHeight = (value: number) => {
    setHeight(value);
    if (locked && original.height) setWidth(Math.max(1, Math.round(value * original.width / original.height)));
  };

  return (
    <div className="screenshot-save-mask" onPointerDown={(event) => event.stopPropagation()}>
      <div className="screenshot-save-dialog" role="dialog" aria-label={t.saveTitle} aria-modal="true">
        <header className="screenshot-save-head">
          <span>{t.saveTitle}</span>
          <button type="button" className="screenshot-save-close" aria-label={t.close} onClick={onClose}><X size={16} /></button>
        </header>
        <div className="screenshot-save-body">
          <div className="screenshot-save-preview">
            <img src={`data:image/png;base64,${png}`} alt={t.saveTitle} />
          </div>
          <div className="screenshot-save-settings">
            <label className="screenshot-save-field">
              <span>{t.saveLocation}</span>
              <span className="screenshot-save-folder">
                <input value={folder} placeholder={t.downloads} readOnly
                  onPointerDown={(event) => event.stopPropagation()} />
                <button type="button" aria-label={t.saveChooseFolder} onClick={() => void pickFolder().catch((cause) => setError(t.saveFailed(String(cause))))}><FolderOpen size={15} /></button>
              </span>
            </label>
            <label className="screenshot-save-field">
              <span>{t.saveFileName}</span>
              <span className="screenshot-save-name">
                <input value={name} onChange={(event) => setName(event.target.value)}
                  onPointerDown={(event) => event.stopPropagation()} />
                <select value={format} onChange={(event) => setFormat(event.target.value as Format)} aria-label={t.saveFormat}>
                  {FORMATS.map((item) => <option key={item} value={item}>.{item}</option>)}
                </select>
              </span>
            </label>
            <div className="screenshot-save-field">
              <span>{t.saveResize}</span>
              <div className="screenshot-save-size">
                <label>W <input type="number" min={1} value={width || ""} onChange={(event) => onWidth(Number(event.target.value))}
                  onPointerDown={(event) => event.stopPropagation()} /></label>
                <span>×</span>
                <label>H <input type="number" min={1} value={height || ""} onChange={(event) => onHeight(Number(event.target.value))}
                  onPointerDown={(event) => event.stopPropagation()} /></label>
                <button type="button" className={locked ? "locked" : ""} onClick={() => setLocked((value) => !value)} aria-label={t.lockAspect}>
                  {locked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}
                </button>
                <button type="button" onClick={() => { setWidth(original.width); setHeight(original.height); }} aria-label={t.resetSize}><RotateCcw size={14} /></button>
              </div>
              <small>{t.originalSize} {original.width} × {original.height} px</small>
            </div>
            <p className="screenshot-save-estimate">{t.saveEstimate}：<b>{estimate}</b></p>
            {error ? <p className="screenshot-save-error" role="alert">{error}</p> : null}
            <button type="button" className="screenshot-save-primary" disabled={busy || !validSize || !validName} onClick={onQuickSave}>
              <ImageDown size={16} />{t.save}
            </button>
            <button type="button" className="screenshot-save-system" disabled={busy || !validSize} onClick={() => void onSystemDialog().catch((cause) => setError(t.saveFailed(String(cause))))}>
              {t.saveUseDialog}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
