import { useMemo, useState, type FormEvent } from "react";
import { ToggleControl } from "../../../components/controls/ToggleControl";
import { useLocale, useTranslation } from "../../../i18n";
import { submitPluginView } from "../api";
import { formValues, normalizeFormModel, type FormField, type FormValue } from "../templateModels";
import "./FormTemplate.css";

/** The form template: the plugin setting field types plus multiline; submitting sends view.submit. */
export function FormTemplate({ pluginId, viewId, model }: { pluginId: string; viewId: string; model: unknown }) {
  const t = useTranslation();
  const { locale } = useLocale();
  const form = useMemo(() => normalizeFormModel(model, locale), [locale, model]);
  const [edits, setEdits] = useState<Record<string, FormValue>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const change = (key: string, value: FormValue) => {
    setSent(false);
    setEdits((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    submitPluginView(pluginId, viewId, formValues(form.fields, edits))
      .then(() => {
        setEdits({});
        setSent(true);
      })
      .catch((error: unknown) => console.error("Failed to submit a plugin form", error))
      .finally(() => setSending(false));
  };

  return (
    <form className="plugin-form" onSubmit={submit}>
      <div className="plugin-form__fields">
        {form.error ? <p className="plugin-form__error" role="alert">{form.error}</p> : null}
        {form.message ? <p className="plugin-form__message" role="status">{form.message}</p> : null}
        {form.fields.length === 0 ? <p className="plugin-form__message">{t.pluginViews.empty}</p> : null}
        {form.fields.map((field) => (
          <PluginFormField key={field.key} field={field} value={edits[field.key] ?? field.value} onChange={(value) => change(field.key, value)} />
        ))}
      </div>
      {form.fields.length > 0 ? (
        <div className="plugin-form__footer">
          {sent ? <span role="status">{t.pluginViews.submitted}</span> : null}
          <button className="plugin-form__submit" type="submit" disabled={sending}>
            {form.submitTitle ?? t.pluginViews.submit}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function PluginFormField({ field, value, onChange }: { field: FormField; value: FormValue; onChange: (value: FormValue) => void }) {
  const id = `plugin-form-${field.key}`;
  if (field.type === "boolean") {
    return (
      <div className="plugin-form__field">
        <ToggleControl label={field.title} checked={value === true} onChange={onChange} />
        {field.description ? <small>{field.description}</small> : null}
      </div>
    );
  }
  let input;
  if (field.type === "select") {
    input = (
      <select id={id} value={String(value)} onChange={(event) => onChange(event.currentTarget.value)}>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.title}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "multiline") {
    input = (
      <textarea id={id} rows={3} value={String(value)} maxLength={field.maxLength} placeholder={field.placeholder ?? undefined} onChange={(event) => onChange(event.currentTarget.value)} />
    );
  } else if (field.type === "number") {
    input = (
      <input
        id={id}
        type="number"
        step={1}
        min={field.min ?? undefined}
        max={field.max ?? undefined}
        value={String(value)}
        onChange={(event) => onChange(event.currentTarget.value === "" ? "" : Number(event.currentTarget.value))}
      />
    );
  } else {
    input = (
      <input id={id} type="text" value={String(value)} maxLength={field.maxLength} placeholder={field.placeholder ?? undefined} onChange={(event) => onChange(event.currentTarget.value)} />
    );
  }
  return (
    <div className="plugin-form__field">
      <label htmlFor={id}>{field.title}</label>
      {input}
      {field.description ? <small>{field.description}</small> : null}
    </div>
  );
}
