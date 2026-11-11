import { useId, useState } from "react";
import { ChevronDown, Coffee } from "lucide-react";
import { useTranslation } from "../../i18n";
import wechatPayUrl from "../../assets/donate/wechat-pay.webp";
import alipayUrl from "../../assets/donate/alipay.webp";
import "./SupportAuthor.css";

/**
 * Settings → About → the last row: tipping the author. The two payment codes are bundled with the
 * app (no network), and open in place under the row rather than in a dialog, so the same thing
 * works in the island's settings page and the standalone window. Clicking the row again closes it.
 */
export function SupportAuthor() {
  const text = useTranslation().settings.project;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const codes = [
    { src: wechatPayUrl, label: text.supportWechat },
    { src: alipayUrl, label: text.supportAlipay },
  ];

  return (
    <div className={`support-author${open ? " support-author--open" : ""}`}>
      <button
        className="support-author__toggle"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Coffee className="project-link__icon support-author__icon" size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
        <span className="project-link__copy">
          <strong>{text.support}</strong>
          <span>{text.supportHint}</span>
        </span>
        <ChevronDown className="project-link__arrow support-author__chevron" size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="support-author__panel" id={panelId}>
          <div className="support-author__codes">
            {codes.map((code) => (
              <figure className="support-author__code" key={code.label}>
                <img src={code.src} alt={text.supportCodeAlt(code.label)} width={172} height={172} draggable={false} />
                <figcaption>{code.label}</figcaption>
              </figure>
            ))}
          </div>
          <p className="support-author__thanks">{text.supportThanks}</p>
        </div>
      )}
    </div>
  );
}
