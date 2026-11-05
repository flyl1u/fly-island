import { useTranslation } from "../../../i18n";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, AtSign, CircleHelp, Image, ImageOff, KeyRound, LoaderCircle, Power, RefreshCw, Server, Unplug } from "lucide-react";
import DOMPurify from "dompurify";
import { MessageSourceIcon } from "../MessageSourceIcon";
import type { MailMessage } from "./api";
import { loadRemoteImagePreference, saveRemoteImagePreference } from "./storage";
import { hasQQMailHelp } from "./mailDomain";
import { MailAccountTabs } from "./MailAccountTabs";
import "./QQMail.css";
import type { QQMailController } from "./useQQMail";

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

export { useQQMail } from "./useQQMail";
export type { QQMailController };

function formatMailTime(time: number, locale: string) {
  return new Date(time).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function QQMailPanel({ controller, navigation, onRead, onBack }: {
  controller: QQMailController;
  navigation: ReactNode;
  onRead?: (message: MailMessage) => void;
  onBack?: () => void;
}) {
  const { snapshot, mailboxes, adding, busy, actionError, connect, setEnabled, refresh, disconnect, openMail, openHelp, selectMailbox, startAdding } = controller;
  const t = useTranslation();
  const [email, setEmail] = useState(snapshot.email ?? "");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [host, setHost] = useState("");
  // A known mailbox only re-enters its code; its address and server stay as saved.
  const newMailbox = !snapshot.email;
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

  useEffect(() => { setEmail(snapshot.email ?? ""); setAuthorizationCode(""); setHost(""); }, [snapshot.email]);
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
          {showForm && hasQQMailHelp(email) && <button className="icon-button" type="button" title={t.mail.help} aria-label={t.mail.helpLabel} onClick={() => void openHelp()}><CircleHelp size={16} strokeWidth={1.8} /></button>}
          <button className="icon-button" type="button" title={t.mail.open} aria-label={t.mail.openLabel} onClick={() => void openMail()}><ArrowUpRight size={16} strokeWidth={1.8} /></button>
          {snapshot.configured && <button className="icon-button" type="button" title={snapshot.lastSyncedAt === null ? t.mail.refresh : t.mail.lastSynced(formatMailTime(snapshot.lastSyncedAt, t.localeTag))} aria-label={t.mail.refreshLabel} disabled={busy || snapshot.syncing || !snapshot.enabled || snapshot.status === "authRequired"} onClick={() => void refresh()}><RefreshCw size={16} strokeWidth={1.8} className={snapshot.syncing ? "qq-mail-spinning" : undefined} /></button>}
          {snapshot.configured && <button className="icon-button" type="button" title={t.mail.disconnect} aria-label={t.mail.disconnectLabel} disabled={busy} onClick={() => void disconnect().then((disconnected) => { if (disconnected) setAuthorizationCode(""); })}><Unplug size={16} strokeWidth={1.8} /></button>}
        </div>
      </header>
      {mailboxes.length > 0 && <MailAccountTabs mailboxes={mailboxes} selected={snapshot.email} adding={adding} busy={busy} onSelect={selectMailbox} onAdd={startAdding} />}
      {error && <p className="qq-panel__error" role="alert">{error}</p>}
      {showForm ? (
        <form className="qq-mail-form" onSubmit={(event) => {
          event.preventDefault();
          void connect(email, authorizationCode, newMailbox ? host : undefined).then((connected) => { if (connected) setAuthorizationCode(""); });
        }}>
          <div className="qq-mail-fields">
            <label className="qq-mail-field"><AtSign size={16} strokeWidth={1.8} aria-hidden="true" /><input id="qq-mail-email" aria-label={t.mail.email} type="email" autoComplete="username" placeholder={t.mail.emailPlaceholder} required maxLength={80} value={email} disabled={busy || snapshot.configured} onChange={(event) => setEmail(event.currentTarget.value)} /></label>
            <label className="qq-mail-field"><KeyRound size={16} strokeWidth={1.8} aria-hidden="true" /><input id="qq-mail-code" aria-label={t.mail.authorizationCode} type="password" autoComplete="off" placeholder={t.mail.authorizationPlaceholder} required maxLength={256} value={authorizationCode} disabled={busy} onChange={(event) => setAuthorizationCode(event.currentTarget.value)} /></label>
            {newMailbox && <label className="qq-mail-field"><Server size={16} strokeWidth={1.8} aria-hidden="true" /><input id="qq-mail-host" aria-label={t.mail.imapHost} type="text" autoComplete="off" spellCheck={false} placeholder={t.mail.imapHostPlaceholder} maxLength={253} value={host} disabled={busy} onChange={(event) => setHost(event.currentTarget.value)} /></label>}
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
