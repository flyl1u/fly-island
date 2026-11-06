import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { getErrorMessage } from "../../utils/error";
import { addCalendarSource, listCalendarSources, removeCalendarSource, type CalendarSource, type CalendarSourceKind } from "./api";
import "./CalendarSourcesSection.css";

const EMPTY_FORM = { kind: "caldav" as CalendarSourceKind, name: "", url: "", username: "", secret: "" };

/**
 * Settings → Calendar: the calendars added, with a delete button each, and the form to add one:
 * a CalDAV account (Feishu, DingTalk, WeCom, iCloud) or an ICS subscription link (Google,
 * Outlook). Adding reads the calendar once, so a wrong address or password is said at once.
 */
export function CalendarSourcesSection() {
  const text = useTranslation().settings.calendar;
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });

  const reload = useCallback(async () => {
    try {
      const listed = await listCalendarSources();
      // An older native side, or a page mocking it, may give nothing usable.
      setSources(Array.isArray(listed) ? listed : []);
    } catch (error) {
      console.error("Failed to list calendars", error);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const add = async () => {
    setState({ busy: true, error: "" });
    try {
      await addCalendarSource(form);
      setForm({ ...EMPTY_FORM, kind: form.kind });
      setState({ busy: false, error: "" });
      await reload();
    } catch (error) {
      setState({ busy: false, error: getErrorMessage(error) });
    }
  };
  const remove = async (id: string) => {
    try {
      await removeCalendarSource(id);
    } catch (error) {
      console.error("Failed to remove the calendar", error);
    }
    await reload();
  };
  const field = (key: keyof typeof EMPTY_FORM, label: string, placeholder: string, type = "text") => (
    <label className="calendar-form__field">
      <span>{label}</span>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setForm({ ...form, [key]: event.currentTarget.value })}
      />
    </label>
  );
  const ready = form.secret.trim() !== "" && (form.kind === "ics" || (form.url.trim() !== "" && form.username.trim() !== ""));

  return (
    <>
      <SettingsGroup title={text.sources} footer={sources.length === 0 ? text.noSources : undefined}>
        {sources.map((source) => (
          <SettingsRow
            key={source.id}
            title={source.name}
            description={source.kind === "ics" ? text.icsFrom(source.host) : `${source.username} · ${source.host}`}
            control={
              <button className="calendar-source__remove" type="button" aria-label={text.remove(source.name)} onClick={() => void remove(source.id)}>
                <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
            }
          />
        ))}
      </SettingsGroup>
      <SettingsGroup title={text.add} footer={form.kind === "caldav" ? text.caldavHint : text.icsHint}>
        <SettingsRow
          title={text.kind}
          control={
            <SettingsChoice
              value={form.kind}
              ariaLabel={text.kind}
              options={[
                { value: "caldav", label: text.caldav },
                { value: "ics", label: text.ics },
              ]}
              onChange={(kind) => setForm({ ...form, kind })}
            />
          }
        />
        <div className="calendar-form">
          {field("name", text.name, text.namePlaceholder)}
          {form.kind === "caldav" ? (
            <>
              {field("url", text.server, "https://caldav.feishu.cn")}
              {field("username", text.username, "")}
              {field("secret", text.password, "", "password")}
            </>
          ) : (
            field("secret", text.link, "https://… 或 webcal://…", "password")
          )}
          {state.error && (
            <p className="calendar-form__error" role="alert">
              {state.error}
            </p>
          )}
          <button className="calendar-form__add" type="button" disabled={!ready || state.busy} onClick={() => void add()}>
            {state.busy ? text.adding : text.addButton}
          </button>
        </div>
      </SettingsGroup>
    </>
  );
}
