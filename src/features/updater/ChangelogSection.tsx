import { useMemo, useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useLocale, useTranslation } from "../../i18n";
import { buildChangelog, inlineParts } from "./changelogParse";
import "./ChangelogSection.css";

// 构建时把每个版本的发布说明原文打进前端：发布说明就是更新日志，不需要另写一份。
const RELEASE_NOTES = import.meta.glob<string>("../../../docs/releases/v*.md", { query: "?raw", import: "default", eager: true });
const COLLAPSED_VERSIONS = 3;

function Inline({ text }: { text: string }) {
  return <>{inlineParts(text).map((part, index) => part.kind === "strong" ? <strong key={index}>{part.value}</strong>
    : part.kind === "code" ? <code key={index}>{part.value}</code> : <span key={index}>{part.value}</span>)}</>;
}

/** 关于页的更新日志：默认展开最近几个版本，其余点“显示全部”。 */
export function ChangelogSection() {
  const text = useTranslation().settings.project;
  const { locale } = useLocale();
  const entries = useMemo(() => buildChangelog(RELEASE_NOTES, locale === "en" ? "en" : "zh-CN"), [locale]);
  const [expanded, setExpanded] = useState(false);
  if (!entries.length) return null;
  const shown = expanded ? entries : entries.slice(0, COLLAPSED_VERSIONS);
  return (
    <SettingsGroup title={text.changelog} footer={entries.length > COLLAPSED_VERSIONS ? (
      <SettingsLinkButton onClick={() => setExpanded((value) => !value)}>
        {expanded ? text.changelogLess : text.changelogAll(entries.length)}
      </SettingsLinkButton>
    ) : undefined}>
      {shown.map((entry) => (
        <section key={entry.version} className="changelog-entry" aria-label={`v${entry.version}`}>
          <h3 className="changelog-entry__version">v{entry.version}</h3>
          <ul className="changelog-entry__list">
            {entry.items.map((item, index) => (
              <li key={index} className={`changelog-entry__item changelog-entry__item--depth-${item.depth}`}><Inline text={item.text} /></li>
            ))}
          </ul>
        </section>
      ))}
    </SettingsGroup>
  );
}
