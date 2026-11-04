import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import type { PluginInfoItem } from "./api";

/** What a running plugin shares with `ui.setInfo`: label, value, Copy and Show for secrets. */
export function PluginInfoList({ items }: { items: PluginInfoItem[] }) {
  const t = useTranslation();
  const { locale } = useLocale();
  const [revealed, setRevealed] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const copy = (index: number, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(index);
      window.setTimeout(() => setCopied((current) => (current === index ? null : current)), 1500);
    });
  };

  return (
    <div className="plugin-info">
      {items.map((item, index) => {
        const hidden = item.secret && revealed !== index;
        return (
          <div className="plugin-info__row" key={`${item.label.en}-${index}`}>
            <span>{item.label[locale]}</span>
            <code title={hidden ? undefined : item.value}>{hidden ? "•".repeat(12) : item.value}</code>
            {item.secret ? (
              <button className="plugin-card__button" type="button" onClick={() => setRevealed(hidden ? index : null)}>
                {hidden ? <Eye size={12} strokeWidth={2.4} /> : <EyeOff size={12} strokeWidth={2.4} />}
                <span>{hidden ? t.settings.plugins.detail.show : t.settings.plugins.detail.hide}</span>
              </button>
            ) : null}
            {item.copy ? (
              <button className="plugin-card__button" type="button" onClick={() => copy(index, item.value)}>
                {copied === index ? <Check size={12} strokeWidth={2.6} /> : <Copy size={12} strokeWidth={2.4} />}
                <span>{copied === index ? t.settings.plugins.detail.copied : t.settings.plugins.detail.copy}</span>
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
