import { useState } from "react";
import { FolderInput, RotateCcw, Send, X } from "lucide-react";
import { SelectControl } from "../../components/controls/SelectControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useTranslation } from "../../i18n";
import { PLUGIN_EVENT_NAMES, type PluginTraceEntry } from "./api";
import { usePluginDev } from "./usePluginDev";
import "./PluginDevSection.css";

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour12: false });

function TraceList({ entries, empty }: { entries: PluginTraceEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="settings-section__hint">{empty}</p>;
  return (
    <ol className="plugin-dev__trace">
      {entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className={entry.outgoing ? "plugin-dev__trace-out" : "plugin-dev__trace-in"}>
          <span>{entry.outgoing ? "→" : "←"}</span>
          <time>{time(entry.at)}</time>
          <code>{entry.text}</code>
        </li>
      ))}
    </ol>
  );
}

/**
 * Settings > Plugins > Developer (collapsed at first): development mode, plugins
 * loaded from folders, their raw JSON-RPC lines and sending them an event by hand.
 */
export function PluginDevSection() {
  const t = useTranslation();
  const text = t.settings.plugins.dev;
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [eventName, setEventName] = useState<string>(PLUGIN_EVENT_NAMES[0]);
  const [payload, setPayload] = useState("{}");
  const [payloadError, setPayloadError] = useState("");
  const dev = usePluginDev(open);
  const enabled = dev.state?.enabled ?? false;

  const load = async () => {
    if (path.trim() && (await dev.load(path.trim()))) setPath("");
  };

  const send = () => {
    if (!dev.selected) return;
    let value: unknown;
    try {
      value = JSON.parse(payload || "{}");
    } catch {
      setPayloadError(text.badJson);
      return;
    }
    setPayloadError("");
    void dev.sendEvent(dev.selected, eventName, value);
  };

  return (
    <section className="settings-section plugins-panel">
      <details className="plugin-dev" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="settings-section__header">
          <span>{text.title}</span>
        </summary>
        <div className="plugin-dev__body">
          <ToggleControl label={text.mode} checked={enabled} onChange={(next) => !dev.busy && dev.setEnabled(next)} />
          <p className="settings-section__hint">{text.modeHint}</p>
          {enabled ? (
            <>
              <div className="plugin-dev__load">
                <input
                  className="plugin-setting__input"
                  value={path}
                  placeholder={text.pathPlaceholder}
                  aria-label={text.path}
                  spellCheck={false}
                  onChange={(event) => setPath(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === "Enter" && void load()}
                />
                <button className="plugin-card__button" type="button" disabled={dev.busy || !path.trim()} onClick={() => void load()}>
                  <FolderInput size={12} strokeWidth={2.4} />
                  <span>{text.load}</span>
                </button>
              </div>
              {dev.state?.plugins.length ? (
                <ul className="plugin-dev__plugins">
                  {dev.state.plugins.map((plugin) => (
                    <li key={plugin.id} className={plugin.id === dev.selected ? "plugin-dev__plugin--selected" : undefined}>
                      <button className="plugin-dev__pick" type="button" onClick={() => dev.select(plugin.id)}>
                        <strong>{plugin.id}</strong>
                        <span>{plugin.path}</span>
                      </button>
                      <button className="plugin-card__button" type="button" disabled={dev.busy} onClick={() => dev.reload(plugin.id)}>
                        <RotateCcw size={12} strokeWidth={2.4} />
                        <span>{text.reload}</span>
                      </button>
                      <button className="plugin-card__button" type="button" disabled={dev.busy} onClick={() => dev.unload(plugin.id)}>
                        <X size={12} strokeWidth={2.4} />
                        <span>{text.unload}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="settings-section__hint">{text.noPlugins}</p>
              )}
              {dev.selected ? (
                <div className="plugin-dev__inspect">
                  <strong>{text.trace(dev.selected)}</strong>
                  <TraceList entries={dev.trace} empty={text.traceEmpty} />
                  <div className="plugin-dev__event">
                    <SelectControl
                      value={eventName}
                      options={PLUGIN_EVENT_NAMES.map((name) => ({ value: name, label: name }))}
                      ariaLabel={text.event}
                      onChange={setEventName}
                    />
                    <textarea
                      className="plugin-setting__input"
                      rows={2}
                      value={payload}
                      aria-label={text.payload}
                      spellCheck={false}
                      onChange={(event) => setPayload(event.currentTarget.value)}
                    />
                    <button className="plugin-card__button" type="button" disabled={dev.busy} onClick={send}>
                      <Send size={12} strokeWidth={2.4} />
                      <span>{text.send}</span>
                    </button>
                  </div>
                  {payloadError ? <p className="plugin-card__error">{payloadError}</p> : null}
                </div>
              ) : null}
            </>
          ) : null}
          {dev.error ? <p className="plugin-card__error">{dev.error}</p> : null}
        </div>
      </details>
    </section>
  );
}
