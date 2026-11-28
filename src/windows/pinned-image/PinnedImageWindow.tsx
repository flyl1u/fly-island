// 贴图窗口：置顶显示一张 PNG，焦点蓝色描边，图片上的文字可直接选中复制。
// 交互对齐 PixPin：拖动移动（Alt+拖动忽略文字）、滚轮缩放、双击关闭、右键菜单
// （复制图像/保存图像/识别文字/文本可选/窗口阴影/置顶/关闭/销毁）。
import { useCallback, useEffect, useRef, useState } from "react";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  closePinnedImage,
  copyScreenshotText,
  destroyPinnedImage,
  onPinMenuAction,
  openPinMenu,
  pinCopyImage,
  translatePinnedImage,
  revealPinnedImage,
  pinOcrLines,
  pinSaveImage,
  pinnedImageSrc,
} from "../../features/screenshot/api";
import { useTranslation } from "../../i18n";
import "./PinnedImageWindow.css";

type Line = { text: string; x: number; y: number; width: number; height: number };

export function PinnedImageWindow() {
  const { screenshot: t, localeTag } = useTranslation();
  // URL 只带 window=pinned-image 一个参数（额外参数会被资产解析丢掉）；
  // 本地图片路径存在 Rust 托管状态里，用命令按自己的 label 取。
  const label = getCurrentWindow().label;
  const [src, setSrc] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [focused, setFocused] = useState(true);
  const [scale, setScale] = useState(1);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [textVisible, setTextVisible] = useState(true);
  const [shadowOn, setShadowOn] = useState(false);
  const [topmost, setTopmost] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const initialSize = useRef<{ width: number; height: number } | null>(null);
  // 拖动改「位移阈值」模式：按下不立刻拖，移动超过 4px 才交给原生拖动，
  // 否则第一次按下就进入系统拖拽循环，Windows 会吞掉后续 dblclick（双击关闭失效的根因）。
  const drag = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const win = useRef(getCurrentWindow());
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  }, []);

  useEffect(() => {
    let alive = true;
    pinnedImageSrc(label)
      .then((path) => { if (alive) setSrc(path); })
      .catch(() => {});
    return () => { alive = false; };
  }, [label]);

  /** 图片真正加载完成 + 合成一帧后才显示：避免空白窗口闪一下、位置抖一下。 */
  const revealed = useRef(false);
  const reveal = useCallback(() => {
    if (revealed.current) return;
    revealed.current = true;
    setFocused(true);
    // 双帧等待图片被 WebView 合成，再由 Rust 锁定位置后显示：不闪、不挪位。
    requestAnimationFrame(() => requestAnimationFrame(() => {
      void revealPinnedImage(label).catch(() => { void win.current.show(); });
    }));
  }, [label]);

  const close = useCallback(() => { void closePinnedImage(label).catch(() => { void win.current.close(); }); }, [label]);
  /** 销毁：关闭之外还要删掉临时图片文件。 */
  const destroy = useCallback(() => {
    void destroyPinnedImage(label).catch(() => { void win.current.close(); });
  }, [label]);

  // 图片加载失败/太慢也不能让窗口一直藏着：1.5s 兜底显示。
  useEffect(() => {
    const timer = window.setTimeout(reveal, 1500);
    return () => window.clearTimeout(timer);
  }, [reveal]);

  // 本地 OCR：直接让 Rust 读临时文件识别（不依赖 WebView 图片加载），叠一层
  // 透明文字，鼠标可直接选中复制。图片尺寸单独用 Image 取（坐标换算要用）。
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const image = new Image();
    image.onload = () => { if (alive) setNatural({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.src = convertFileSrc(src);
    void pinOcrLines(label)
      .then((result) => { if (alive) setLines(result); })
      .catch(() => {});
    return () => { alive = false; };
  }, [src, label]);

  const copyImage = useCallback(() => {
    void pinCopyImage(label)
      .then(() => showToast(t.copied))
      .catch((error) => showToast(`${t.copyFailed}：${String(error)}`));
  }, [label, showToast, t]);

  const saveImage = useCallback(() => {
    void (async () => {
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const path = await saveDialog({
        title: t.saveTitle,
        defaultPath: `FlyIsland-${stamp}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return;
      await pinSaveImage(label, path);
      showToast(t.pinSaved);
    })().catch((error) => showToast(`${t.pinSaveFailed}：${String(error)}`));
  }, [label, showToast, t]);

  /** 识别并复制全部文字：已有识别结果就直接复制，没有再跑一次；结果反馈到 toast。 */
  const copyText = useCallback(() => {
    const write = (text: string) => {
      if (!text.trim()) { showToast(t.nothingFound); return; }
      void copyScreenshotText(text)
        .then(() => showToast(t.copied))
        .catch((error) => showToast(`${t.copyFailed}：${String(error)}`));
    };
    if (lines.length > 0) { write(lines.map((line) => line.text).join("\n")); return; }
    void pinOcrLines(label)
      .then((result) => {
        setLines(result);
        write(result.map((line) => line.text).join("\n"));
      })
      .catch(() => showToast(t.nothingFound));
  }, [label, lines, showToast, t]);

  const toggleShadow = useCallback(() => {
    setShadowOn((value) => {
      void win.current.setShadow(!value).catch(() => {});
      return !value;
    });
  }, []);
  const toggleTopmost = useCallback(() => {
    setTopmost((value) => {
      void win.current.setAlwaysOnTop(!value).catch(() => {});
      return !value;
    });
  }, []);
  const toggleText = useCallback(() => {
    setTextVisible((value) => !value);
  }, []);

  /** Ctrl+C：有选中文字就复制文字，没选中才复制整张图（PixPin 同款）。 */
  const copySelectionOrImage = useCallback(() => {
    const selected = window.getSelection()?.toString().trim() ?? "";
    if (!selected) { copyImage(); return; }
    void copyScreenshotText(selected)
      .then(() => showToast(t.copied))
      .catch((error) => showToast(`${t.copyFailed}：${String(error)}`));
  }, [copyImage, showToast, t]);

  const translate = useCallback(() => {
    void translatePinnedImage().catch((cause) => showToast(t.translateFailed(String(cause))));
  }, [showToast, t]);

  useEffect(() => {
    void Promise.all([win.current.innerSize(), win.current.scaleFactor()]).then(([size, factor]) => {
      initialSize.current = { width: size.width / factor, height: size.height / factor };
    }).catch(() => {});
    return () => { if (toastTimer.current !== null) window.clearTimeout(toastTimer.current); };
  }, []);

  // 系统原生右键菜单的动作回传（Rust emit "pin-menu-action"）。
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    const actions: Record<string, () => void> = {
      translate, text: toggleText, recognize: copyText, copy: copyImage, save: saveImage,
      shadow: toggleShadow, topmost: toggleTopmost, close, destroy,
    };
    void onPinMenuAction((action) => {
      actions[action]?.();
    }).then((unsubscribe) => {
      if (disposed) unsubscribe();
      else off = unsubscribe;
    }).catch(() => {});
    return () => { disposed = true; off?.(); };
  }, [translate, toggleText, copyText, copyImage, saveImage, toggleShadow, toggleTopmost, close, destroy]);

  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key === "Escape" && event.shiftKey) { event.preventDefault(); destroy(); }
      else if (event.key === "Escape") { event.preventDefault(); close(); }
      else if ((event.ctrlKey || event.metaKey) && key === "q") { event.preventDefault(); translate(); }
      else if ((event.ctrlKey || event.metaKey) && key === "c") { event.preventDefault(); copySelectionOrImage(); }
      else if ((event.ctrlKey || event.metaKey) && key === "s") { event.preventDefault(); saveImage(); }
      else if (event.shiftKey && key === "c") { event.preventDefault(); copyText(); } else if ((event.ctrlKey || event.metaKey) && key === "a") {
        event.preventDefault();
        const selection = window.getSelection();
        const node = document.querySelector(".pin-text-layer");
        if (selection && node) {
          const range = document.createRange();
          range.selectNodeContents(node);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        // 单键快捷键对齐 PixPin：E 文本可选 / Y 阴影 / T 置顶。
        if (key === "e") { event.preventDefault(); toggleText(); }
        else if (key === "y") { event.preventDefault(); toggleShadow(); }
        else if (key === "t") { event.preventDefault(); toggleTopmost(); }
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKey);
    };
  }, [translate, close, copySelectionOrImage, copyText, destroy, saveImage, toggleShadow, toggleText, toggleTopmost]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    // 菜单内部点击必须放行：pointerdown 先冒泡到这里就把菜单卸载的话，
    // 菜单项的 click 永远不会触发（右键菜单所有功能「点了没反应」的根因）。
    if ((event.target as HTMLElement).closest(".pin-ctx-menu, .pin-text-menu")) return;
    setMenu(null);
    // 落在图片空白处（或 Alt+按下）才进入候选拖动；落在文字上则让文字可选中。
    if (event.altKey || !(event.target as HTMLElement).closest(".pin-text-line")) {
      drag.current = { x: event.clientX, y: event.clientY, dragging: false };
    }
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state || state.dragging) return;
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 4) return;
    state.dragging = true;
    void win.current.startDragging();
  };
  const onPointerUp = () => { drag.current = null; };

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const size = initialSize.current;
    if (!size) return;
    const next = Math.max(0.3, Math.min(4, Math.round((scale + (event.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10));
    void win.current.setSize(new LogicalSize((size.width - 16) * next + 16, (size.height - 16) * next + 16))
      .then(() => setScale(next)).catch((cause) => showToast(String(cause)));
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    // 双击文字是选词，不关闭贴图；双击图片空白处才关闭。
    if ((event.target as HTMLElement).closest(".pin-text-line")) return;
    close();
  };
  const onMouseUp = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (text) setMenu({ x: event.clientX, y: event.clientY, text });
    else setMenu(null);
  };
  const onContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setMenu(null);
    // 系统原生菜单在窗口外弹出，小图也不会被裁；坐标要用屏幕物理像素。
    void openPinMenu(label, event.screenX, event.screenY, textVisible, shadowOn, topmost, localeTag.startsWith("en")).catch(() => {});
  };

  return (
    <div className={`pin-root${focused ? " pin-root-focused" : ""}`} onPointerDown={onPointerDown}
      onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}
      onDoubleClick={onDoubleClick} onMouseUp={onMouseUp} onContextMenu={onContextMenu}>
      <div className="pin-stage">
        <img className="pin-image" src={src ? convertFileSrc(src) : undefined} alt={t.pin} draggable={false}
          onLoad={reveal} onError={reveal} />
        {/* 透明文字层：字是透明的，但可以被鼠标选中、复制，位置和原图一一对应。 */}
        <div className="pin-text-layer" style={{ display: textVisible ? undefined : "none" }}>
          {lines.map((line, index) => {
            // OCR 坐标是图片原始像素；换算成百分比，文字层即可随窗口缩放对齐。
            const left = natural.width ? line.x / natural.width * 100 : 0;
            const top = natural.height ? line.y / natural.height * 100 : 0;
            const width = natural.width ? line.width / natural.width * 100 : 0;
            const height = natural.height ? line.height / natural.height * 100 : 0;
            // 字号用 cqh（容器高度百分比）：行高百分比相对容器高，用 cqw 会在横图上错位。
            return (
              <span key={`${index}-${line.text}`} className="pin-text-line"
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, fontSize: `clamp(9px, ${height * 0.95}cqh, 40px)` }}>
                {line.text}
              </span>
            );
          })}
        </div>
      </div>
      {menu ? (
        <div className="pin-text-menu" style={{ left: Math.max(0, Math.min(menu.x, window.innerWidth - 90)), top: Math.max(0, Math.min(menu.y, window.innerHeight - 36)) }}
          onClick={() => {
            void copyScreenshotText(menu.text)
              .then(() => showToast(t.copied))
              .catch(() => showToast(t.copyFailed));
            setMenu(null);
          }}>
          {t.copy}
        </div>
      ) : null}
      {toast ? <div className="pin-toast">{toast}</div> : null}
    </div>
  );
}
