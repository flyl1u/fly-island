import { useTranslation } from "./i18n";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, ArrowRight, ArrowUpRight, AtSign, CircleHelp, Image, ImageOff, KeyRound, LoaderCircle, Power, RefreshCw, Unplug } from "lucide-react";
import DOMPurify from "dompurify";
import { MessageSourceIcon } from "./MessageSourceIcon";
import { nextQQPreview, type QQPreviewTiming } from "./qqNotificationTiming";
import "./QQMail.css";

const SETTINGS_KEY = "focusd-island-qq-mail-settings";
const REMOTE_IMAGES_KEY = "focusd-island-qq-mail-remote-images";

export type MailMessage = {
  id: string;
  uid: number;
  sender: string;
  subject: string;
  receivedAt: number | null;
  unread: boolean;
};

export type MailContent = { id: string; content: string; contentType: "text/plain" | "text/html" };

// 图片保留 src：https 远程图（发件人 CDN）和 data:image/* 内嵌图都要显示；
// 统一关闭 referrer 并延迟加载，避免把当前页地址带给发件人。
// 远程图默认不加载，避免一打开邮件就把时间和 IP 暴露给发件人，由阅读页的开关放行。
let allowRemoteImages = false;
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName !== "IMG") return;
  const src = node.getAttribute("src");
  // 没有可用地址的图片（cid 未内联、http 混合内容、被拦下的远程图）直接去掉，避免留下裂图占位
  if (!src || (!allowRemoteImages && /^https?:/i.test(src))) { node.remove(); return; }
  node.setAttribute("loading", "lazy");
  node.setAttribute("decoding", "async");
  node.setAttribute("referrerpolicy", "no-referrer");
});

// 只有「多行多列、首行是表头」的表才算数据表，图表和布局表不再画满屏灰格子。
function markDataTables(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const table of Array.from(template.content.querySelectorAll("table"))) {
    const rows = Array.from(table.rows);
    if (rows.length < 2 || rows[0].cells.length < 2) continue;
    if (!rows.every((row) => row.cells.length >= 2)) continue;
    if (!Array.from(rows[0].cells).every((cell) => cell.tagName === "TH")) continue;
    table.setAttribute("data-mail-table", "data");
  }
  return template.innerHTML;
}

export function sanitizeMailHtml(content: string, options?: { allowRemoteImages?: boolean }) {
  allowRemoteImages = options?.allowRemoteImages ?? false;
  try {
    return markDataTables(DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ["p", "br", "div", "span", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "blockquote", "pre", "code", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "a", "hr", "img"],
      ALLOWED_ATTR: ["href", "title", "colspan", "rowspan", "src", "alt", "width", "height"],
      ALLOWED_URI_REGEXP: /^(?:https?:|data:image\/)/i,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    }));
  } finally {
    allowRemoteImages = false;
  }
}

// 统计正文里有多少张远程图被拦下，用于提示条；template 里的图片不会发起请求。
export function countRemoteImages(content: string) {
  const template = document.createElement("template");
  template.innerHTML = content;
  return Array.from(template.content.querySelectorAll("img"))
    .filter((image) => /^https?:/i.test(image.getAttribute("src") ?? "")).length;
}

export type MailSnapshot = {
  revision: number;
  email: string | null;
  configured: boolean;
  enabled: boolean;
  syncing: boolean;
  status: "disconnected" | "connecting" | "connected" | "paused" | "authRequired" | "error";
  unreadCount: number | null;
  items: MailMessage[];
  lastSyncedAt: number | null;
  error: string | null;
};

type MailEvent = { snapshot: MailSnapshot; newestId: string | null; windowVisible: boolean };
type MailSettings = { email: string; enabled: boolean };

const EMPTY_SNAPSHOT: MailSnapshot = {
  revision: 0, email: null, configured: false, enabled: false, syncing: false,
  status: "disconnected", unreadCount: null, items: [], lastSyncedAt: null, error: null,
};

function loadSettings(): MailSettings | null {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<MailSettings> | null;
    return typeof stored?.email === "string" && typeof stored.enabled === "boolean"
      ? { email: stored.email, enabled: stored.enabled } : null;
  } catch { return null; }
}

export function useQQMail(canPreview: boolean) {
  const t = useTranslation();
  const translationsRef = useRef(t);
  translationsRef.current = t;
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(isTauri);
  const [selectedMail, setSelectedMail] = useState<MailMessage | null>(null);
  const [content, setContent] = useState<MailContent | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const readerRequestRef = useRef(0);
  const [previewWindow, setPreviewWindow] = useState<{ id: string; receivedAt: number; expiresAt: number } | null>(null);
  const canPreviewRef = useRef(canPreview);
  const revisionRef = useRef(-1);
  const accountRef = useRef<string | null>(null);
  const timingRef = useRef<QQPreviewTiming | null>(null);
  const actionIdRef = useRef(0);

  const clearPreview = useCallback(() => {
    timingRef.current = null;
    setPreviewWindow(null);
  }, []);

  const closeReader = useCallback(() => {
    ++readerRequestRef.current;
    setSelectedMail(null);
    setContent(null);
    setReadError(null);
    setReading(false);
  }, []);

  useLayoutEffect(() => {
    canPreviewRef.current = canPreview;
    if (!canPreview) clearPreview();
  }, [canPreview, clearPreview]);

  const acceptSnapshot = useCallback((next: MailSnapshot, persist = true) => {
    if (next.revision < revisionRef.current) return false;
    revisionRef.current = next.revision;
    if (next.email !== accountRef.current || !next.enabled || next.status !== "connected") clearPreview();
    if (next.email !== accountRef.current || !next.configured || next.status === "authRequired") closeReader();
    accountRef.current = next.email;
    setSnapshot(next);
    if (next.status === "connected" && !next.syncing) setActionError(null);
    if (persist) {
      try {
        if (next.configured && next.email) {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify({ email: next.email, enabled: next.enabled }));
        } else if (next.status === "disconnected" && next.revision > 0) {
          localStorage.removeItem(SETTINGS_KEY);
        }
      } catch { setActionError(translationsRef.current.mail.savePreferencesFailed); }
    }
    return true;
  }, [clearPreview, closeReader]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const saved = loadSettings();
    void (async () => {
      unlisten = await listen<MailEvent>("qq-mail-changed", ({ payload }) => {
        if (cancelled || !acceptSnapshot(payload.snapshot)) return;
        if (!canPreviewRef.current || !payload.windowVisible || !payload.snapshot.enabled
          || payload.snapshot.status !== "connected") {
          clearPreview();
          return;
        }
        if (payload.newestId) {
          const receivedAt = Date.now();
          const { timing, expiresAt } = nextQQPreview(timingRef.current, receivedAt);
          timingRef.current = timing;
          setPreviewWindow(expiresAt === null ? null : { id: payload.newestId, receivedAt, expiresAt });
        }
      });
      if (cancelled) { unlisten(); return; }
      const current = await invoke<MailSnapshot>("get_qq_mail_state");
      if (cancelled) return;
      acceptSnapshot(current, false);
      if (!current.email && saved) {
        const restored = await invoke<MailSnapshot>("set_qq_mail_enabled", saved);
        if (!cancelled) acceptSnapshot(restored);
      }
    })().catch((error: unknown) => {
      if (!cancelled) setActionError(String(error));
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; ++readerRequestRef.current; unlisten?.(); };
  }, [acceptSnapshot, clearPreview]);

  useEffect(() => {
    if (!previewWindow) return;
    const timer = window.setTimeout(() => setPreviewWindow(null), Math.max(0, previewWindow.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previewWindow]);

  const run = useCallback(async (command: string, args?: Record<string, unknown>) => {
    if (!isTauri()) { setActionError(t.mail.desktopConnect); return false; }
    const id = ++actionIdRef.current;
    setBusy(true);
    setActionError(null);
    try {
      const next = await invoke<MailSnapshot>(command, args);
      return id === actionIdRef.current && acceptSnapshot(next);
    } catch (error) {
      if (id === actionIdRef.current) setActionError(String(error));
      return false;
    } finally { if (id === actionIdRef.current) setBusy(false); }
  }, [acceptSnapshot, t]);

  const connect = useCallback((email: string, authorizationCode: string) =>
    run("connect_qq_mail", { email, authorizationCode }), [run]);
  const setEnabled = useCallback((enabled: boolean) =>
    run("set_qq_mail_enabled", { email: snapshot.email, enabled }), [run, snapshot.email]);
  const refresh = useCallback(() => run("refresh_qq_mail"), [run]);
  const disconnect = useCallback(() => { closeReader(); return run("disconnect_qq_mail"); }, [closeReader, run]);
  const readMail = useCallback(async (message: MailMessage) => {
    const requestId = ++readerRequestRef.current;
    setSelectedMail(message);
    setContent(null);
    setReadError(null);
    clearPreview();
    if (!isTauri()) { setReadError(t.mail.desktopRead); setReading(false); return false; }
    setReading(true);
    try {
      const next = await invoke<MailContent>("read_qq_mail", { messageId: message.id });
      if (requestId !== readerRequestRef.current) return false;
      if (next.id !== message.id) throw new Error(t.mail.changed);
      setContent(next);
      return true;
    } catch (error) {
      if (requestId === readerRequestRef.current) setReadError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      if (requestId === readerRequestRef.current) setReading(false);
    }
  }, [clearPreview, t]);
  const openLink = useCallback(async (href: string) => {
    if (!/^https?:\/\//i.test(href)) return;
    try { await openUrl(href); }
    catch { setActionError(t.mail.openLinkFailed); }
  }, [t]);
  const openMail = useCallback(async () => {
    try {
      await openUrl("https://mail.qq.com/");
      clearPreview();
      return true;
    } catch {
      setActionError(t.mail.openFailed);
      return false;
    }
  }, [clearPreview, t]);
  const openHelp = useCallback(async () => {
    try { await openUrl("https://service.mail.qq.com/"); }
    catch { setActionError(t.mail.helpFailed); }
  }, [t]);

  const preview = canPreview && previewWindow && snapshot.enabled && snapshot.status === "connected"
    ? snapshot.items.find((item) => item.id === previewWindow.id && item.unread) ?? null : null;

  return {
    snapshot, busy, actionError, connect, setEnabled, refresh, disconnect, openMail, openHelp,
    selectedMail, content, reading, readError, readMail, closeReader, openLink,
    preview, previewReceivedAt: preview ? previewWindow?.receivedAt ?? null : null,
  };
}

export type QQMailController = ReturnType<typeof useQQMail>;

function formatMailTime(time: number, locale: string) {
  return new Date(time).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function loadRemoteImagePreference() {
  try { return localStorage.getItem(REMOTE_IMAGES_KEY) === "true"; } catch { return false; }
}

function saveRemoteImagePreference(allow: boolean) {
  try { localStorage.setItem(REMOTE_IMAGES_KEY, String(allow)); } catch { /* 偏好保存失败不影响本次阅读 */ }
}

export function QQMailPanel({ controller, navigation, onRead, onBack }: {
  controller: QQMailController;
  navigation: ReactNode;
  onRead?: (message: MailMessage) => void;
  onBack?: () => void;
}) {
  const { snapshot, busy, actionError, connect, setEnabled, refresh, disconnect, openMail, openHelp } = controller;
  const t = useTranslation();
  const [email, setEmail] = useState(snapshot.email ?? "");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const showForm = !snapshot.configured || snapshot.status === "authRequired";
  const error = actionError || snapshot.error;
  const listRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const returnFocus = useRef<string | null>(null);
  const { selectedMail, content, reading, readError, readMail, closeReader, openLink } = controller;
  const [remoteImages, setRemoteImages] = useState(loadRemoteImagePreference);
  const html = useMemo(() => content?.contentType === "text/html" ? sanitizeMailHtml(content.content, { allowRemoteImages: remoteImages }) : "", [content, remoteImages]);
  const blockedImages = useMemo(() => content?.contentType === "text/html" && !remoteImages ? countRemoteImages(content.content) : 0, [content, remoteImages]);
  const toggleRemoteImages = () => setRemoteImages((previous) => { saveRemoteImagePreference(!previous); return !previous; });
  const readerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (snapshot.email) setEmail(snapshot.email); }, [snapshot.email]);
  // 远程图可能失效或被 CDN 拒绝，出错时就地隐藏，避免正文里出现裂图占位
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    const hideBrokenImage = (event: Event) => {
      if (event.target instanceof HTMLImageElement) event.target.style.display = "none";
    };
    node.addEventListener("error", hideBrokenImage, true);
    return () => node.removeEventListener("error", hideBrokenImage, true);
  }, [html]);
  useLayoutEffect(() => {
    if (!selectedMail && listRef.current) {
      listRef.current.scrollTop = listScroll.current;
      if (returnFocus.current) {
        Array.from(listRef.current.querySelectorAll<HTMLButtonElement>("button[data-mail-id]")).find(button => button.dataset.mailId === returnFocus.current)?.focus({ preventScroll: true });
        returnFocus.current = null;
      }
    }
    if (selectedMail && readerRef.current) { returnFocus.current = selectedMail.id; readerRef.current.scrollTop = 0; readerRef.current.focus(); }
  }, [selectedMail]);

  if (selectedMail) return (
    <section className="qq-panel qq-mail-panel" aria-label={t.mail.reader}>
      <header className="qq-panel__header">
        <button className="message-action qq-mail-back" type="button" onClick={onBack ?? closeReader}><ArrowLeft size={15} strokeWidth={1.8} />{t.mail.back}</button>
        {content?.contentType === "text/html" && <button className="icon-button" type="button" aria-label={t.mail.remoteImages} aria-pressed={remoteImages} title={remoteImages ? t.mail.remoteImagesOn : t.mail.remoteImagesOff} onClick={toggleRemoteImages}>{remoteImages ? <Image size={15} strokeWidth={1.8} /> : <ImageOff size={15} strokeWidth={1.8} />}</button>}
        <button className="message-action" type="button" title={t.mail.webHint} onClick={() => void openMail()}>{t.mail.openWeb}<ArrowUpRight size={14} strokeWidth={1.8} /></button>
      </header>
      {actionError && <p className="qq-panel__error" role="alert">{actionError}</p>}
      <div className="qq-mail-reader" ref={readerRef} tabIndex={-1} aria-label={t.mail.body} aria-busy={reading}>
        <h2 className="qq-mail-reader__subject">{selectedMail.subject}</h2>
        <div className="qq-mail-reader__meta"><span>{selectedMail.sender}</span>{selectedMail.receivedAt !== null && <time dateTime={new Date(selectedMail.receivedAt).toISOString()}>{formatMailTime(selectedMail.receivedAt, t.localeTag)}</time>}</div>
        {blockedImages > 0 && <div className="qq-mail-remote"><span>{t.mail.remoteImagesBlocked(blockedImages)}</span><button className="message-action" type="button" onClick={toggleRemoteImages}>{t.mail.loadRemoteImages}</button></div>}
        {reading ? <div className="qq-mail-reader__state" role="status"><LoaderCircle size={19} className="qq-mail-spinning" />{t.mail.loading}</div>
          : readError ? <div className="qq-mail-reader__state"><p className="qq-panel__error" role="alert">{readError}</p><button className="message-action" type="button" onClick={() => void readMail(selectedMail)}><RefreshCw size={14} />{t.common.retry}</button></div>
          : content?.contentType === "text/html" ? <div className="qq-mail-body" ref={bodyRef} onClick={(event) => {
              const link = event.target instanceof Element ? event.target.closest("a") : null;
              if (!link) return;
              event.preventDefault();
              if (link.getAttribute("href")) void openLink(link.getAttribute("href")!);
            }} dangerouslySetInnerHTML={{ __html: html || DOMPurify.sanitize(`<p>${t.mail.emptyHtml}</p>`) }} />
          : <div className="qq-mail-body qq-mail-body--text">{content?.content || t.mail.emptyText}</div>}
      </div>
      <p className="qq-mail-reader__notice">{t.mail.notice}</p>
    </section>
  );

  return (
    <section className="qq-panel qq-mail-panel" aria-label={t.messages.qqMail}>
      <header className="qq-panel__header">
        {navigation}
        <div className="qq-panel__toolbar">
          {snapshot.configured && <button className="icon-button message-receiver-toggle" type="button" role="switch" aria-checked={snapshot.enabled} aria-label={t.mail.receive} title={snapshot.enabled ? t.mail.pause : t.mail.resume} disabled={busy || snapshot.status === "authRequired"} onClick={() => void setEnabled(!snapshot.enabled)}><Power size={15} strokeWidth={1.8} /></button>}
          {showForm && <button className="icon-button" type="button" title={t.mail.help} aria-label={t.mail.helpLabel} onClick={() => void openHelp()}><CircleHelp size={16} strokeWidth={1.8} /></button>}
          <button className="icon-button" type="button" title={t.mail.open} aria-label={t.mail.openLabel} onClick={() => void openMail()}><ArrowUpRight size={16} strokeWidth={1.8} /></button>
          {snapshot.configured && <button className="icon-button" type="button" title={snapshot.lastSyncedAt === null ? t.mail.refresh : t.mail.lastSynced(formatMailTime(snapshot.lastSyncedAt, t.localeTag))} aria-label={t.mail.refreshLabel} disabled={busy || snapshot.syncing || !snapshot.enabled || snapshot.status === "authRequired"} onClick={() => void refresh()}><RefreshCw size={16} strokeWidth={1.8} className={snapshot.syncing ? "qq-mail-spinning" : undefined} /></button>}
          {snapshot.configured && <button className="icon-button" type="button" title={t.mail.disconnect} aria-label={t.mail.disconnectLabel} disabled={busy} onClick={() => void disconnect().then((disconnected) => { if (disconnected) setAuthorizationCode(""); })}><Unplug size={16} strokeWidth={1.8} /></button>}
        </div>
      </header>
      {snapshot.configured && <div className="qq-mail-account" title={`${snapshot.email} · ${t.mail.status[snapshot.status]}`}><span className="message-status" data-state={snapshot.status} role="status" aria-label={t.mail.status[snapshot.status]} /><span className="qq-mail-account__email">{snapshot.email}</span></div>}
      {error && <p className="qq-panel__error" role="alert">{error}</p>}
      {showForm ? (
        <form className="qq-mail-form" onSubmit={(event) => {
          event.preventDefault();
          void connect(email, authorizationCode).then((connected) => { if (connected) setAuthorizationCode(""); });
        }}>
          <div className="qq-mail-fields">
            <label className="qq-mail-field"><AtSign size={16} strokeWidth={1.8} aria-hidden="true" /><input id="qq-mail-email" aria-label={t.mail.email} type="email" autoComplete="username" placeholder={t.mail.emailPlaceholder} required maxLength={80} value={email} disabled={busy || snapshot.configured} onChange={(event) => setEmail(event.currentTarget.value)} /></label>
            <label className="qq-mail-field"><KeyRound size={16} strokeWidth={1.8} aria-hidden="true" /><input id="qq-mail-code" aria-label={t.mail.authorizationCode} type="password" autoComplete="off" placeholder={t.mail.authorizationPlaceholder} required maxLength={256} value={authorizationCode} disabled={busy} onChange={(event) => setAuthorizationCode(event.currentTarget.value)} /></label>
          </div>
          <div className="qq-mail-form__actions">
            <button className="message-action qq-mail-connect" type="submit" disabled={busy || !email.trim() || !authorizationCode.trim()}>{busy ? <LoaderCircle size={15} strokeWidth={1.8} className="qq-mail-spinning" /> : <ArrowRight size={15} strokeWidth={1.8} />}{busy ? t.common.connecting : t.mail.connect}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="qq-panel__list qq-mail-list" ref={listRef} onScroll={(event) => { listScroll.current = event.currentTarget.scrollTop; }} role="list" aria-label={t.mail.inbox} aria-busy={snapshot.syncing}>
            {snapshot.items.length === 0 ? (
              <div className="qq-panel__empty" role="status"><span className="message-empty-icon">{snapshot.syncing ? <LoaderCircle size={26} strokeWidth={1.5} className="qq-mail-spinning" /> : <MessageSourceIcon source="qqMail" size={28} />}</span><span>{snapshot.syncing ? t.mail.syncing : t.mail.empty}</span></div>
            ) : snapshot.items.map((item) => (
              <article className={`qq-panel__item qq-mail-item${item.unread ? " qq-mail-item--unread" : ""}`} key={item.id} role="listitem">
                <button type="button" data-mail-id={item.id} onClick={() => { if (onRead) onRead(item); else void readMail(item); }} aria-label={t.mail.readMessage(item.subject, item.unread)}>
                  <div className="qq-panel__item-heading"><strong title={item.sender}>{item.unread && <span className="qq-mail-unread-dot" aria-hidden="true" />}<span>{item.sender}</span></strong>{item.receivedAt !== null && <time dateTime={new Date(item.receivedAt).toISOString()}>{formatMailTime(item.receivedAt, t.localeTag)}</time>}</div>
                  <p>{item.subject}</p>
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
