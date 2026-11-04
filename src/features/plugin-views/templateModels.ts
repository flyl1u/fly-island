import { asRecord, readActions, readText, type ViewAction, type ViewLocale } from "./model.ts";

/** Detail, form and status template data; see model.ts for the rules. */

export type DetailModel = {
  title: string | null;
  markdown: string | null;
  meta: { label: string; value: string }[];
  actions: ViewAction[];
  loading: boolean;
  error: string | null;
};

const MAX_META = 20;

/** `{ title?, markdown?, meta?: [{ label, value }], actions?, loading?, error? }`. */
export function normalizeDetailModel(value: unknown, locale: ViewLocale): DetailModel {
  const record = asRecord(value);
  const meta: DetailModel["meta"] = [];
  for (const entry of Array.isArray(record.meta) ? record.meta : []) {
    const item = asRecord(entry);
    const label = readText(item.label, locale, 40);
    const text = readText(typeof item.value === "number" ? String(item.value) : item.value, locale, 200);
    if (label && text) meta.push({ label, value: text });
    if (meta.length >= MAX_META) break;
  }
  return {
    title: readText(record.title, locale, 200),
    markdown: typeof record.markdown === "string" ? record.markdown : readText(record.markdown, locale, 20000),
    meta,
    actions: readActions(record.actions, locale, 3),
    loading: record.loading === true,
    error: readText(record.error, locale, 300),
  };
}

export type FormFieldType = "boolean" | "string" | "multiline" | "number" | "select";
export type FormValue = boolean | string | number;

export type FormField = {
  key: string;
  type: FormFieldType;
  title: string;
  description: string | null;
  placeholder: string | null;
  value: FormValue;
  options: { value: string; title: string }[];
  min: number | null;
  max: number | null;
  /** Longest text for string and multiline fields. */
  maxLength: number;
};

export type FormModel = {
  fields: FormField[];
  submitTitle: string | null;
  message: string | null;
  error: string | null;
};

const MAX_FIELDS = 20;
const FIELD_TYPES: FormFieldType[] = ["boolean", "string", "multiline", "number", "select"];

function readField(value: unknown, locale: ViewLocale): FormField | null {
  const record = asRecord(value);
  const key = typeof record.key === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(record.key) ? record.key : null;
  const type = FIELD_TYPES.find((candidate) => candidate === record.type);
  const title = readText(record.title, locale, 80);
  if (!key || !type || !title) return null;
  const options: FormField["options"] = [];
  for (const entry of Array.isArray(record.options) ? record.options : []) {
    const option = asRecord(entry);
    const optionTitle = readText(option.title, locale, 60);
    if (typeof option.value === "string" && option.value.length <= 64 && optionTitle) options.push({ value: option.value, title: optionTitle });
    if (options.length >= 20) break;
  }
  if (type === "select" && options.length === 0) return null;
  const min = typeof record.min === "number" && Number.isFinite(record.min) ? Math.trunc(record.min) : null;
  const max = typeof record.max === "number" && Number.isFinite(record.max) ? Math.trunc(record.max) : null;
  const maxLength = type === "multiline" ? 4000 : 1000;
  const raw = record.value;
  let fieldValue: FormValue;
  if (type === "boolean") fieldValue = raw === true;
  else if (type === "number") {
    const number = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : min ?? 0;
    fieldValue = Math.min(Math.max(number, min ?? Number.MIN_SAFE_INTEGER), max ?? Number.MAX_SAFE_INTEGER);
  } else if (type === "select") fieldValue = options.some((option) => option.value === raw) ? (raw as string) : options[0].value;
  else fieldValue = typeof raw === "string" ? raw.slice(0, maxLength) : "";
  return {
    key,
    type,
    title,
    description: readText(record.description, locale, 200),
    placeholder: readText(record.placeholder, locale, 80),
    value: fieldValue,
    options,
    min,
    max,
    maxLength,
  };
}

/** `{ fields: [{ key, type, title, description?, placeholder?, value?, options?, min?, max? }], submitTitle?, message?, error? }`. */
export function normalizeFormModel(value: unknown, locale: ViewLocale): FormModel {
  const record = asRecord(value);
  const fields: FormField[] = [];
  for (const entry of Array.isArray(record.fields) ? record.fields : []) {
    const field = readField(entry, locale);
    if (field && !fields.some((known) => known.key === field.key)) fields.push(field);
    if (fields.length >= MAX_FIELDS) break;
  }
  return {
    fields,
    submitTitle: readText(record.submitTitle, locale, 24),
    message: readText(record.message, locale, 200),
    error: readText(record.error, locale, 300),
  };
}

/** The values to send with view.submit: numbers clamped, texts cut. */
export function formValues(fields: FormField[], edits: Record<string, FormValue>): Record<string, FormValue> {
  const values: Record<string, FormValue> = {};
  for (const field of fields) {
    const edit = edits[field.key] ?? field.value;
    if (field.type === "number") {
      const number = typeof edit === "number" ? edit : Number(edit);
      const whole = Number.isFinite(number) ? Math.trunc(number) : (field.value as number);
      values[field.key] = Math.min(Math.max(whole, field.min ?? Number.MIN_SAFE_INTEGER), field.max ?? Number.MAX_SAFE_INTEGER);
    } else if (field.type === "boolean") values[field.key] = edit === true;
    else if (field.type === "select") values[field.key] = field.options.some((option) => option.value === edit) ? edit : field.value;
    else values[field.key] = String(edit).slice(0, field.maxLength);
  }
  return values;
}

export type StatusTone = "neutral" | "accent" | "warning" | "danger";

export type StatusModel = {
  primary: string | null;
  secondary: string | null;
  caption: string | null;
  /** 0..1, or null for no progress bar. */
  progress: number | null;
  tone: StatusTone;
  actions: ViewAction[];
};

const TONES: StatusTone[] = ["neutral", "accent", "warning", "danger"];

/** `{ primary, secondary?, caption?, progress? (0-1), tone?, actions? }`. */
export function normalizeStatusModel(value: unknown, locale: ViewLocale): StatusModel {
  const record = asRecord(value);
  const progress = typeof record.progress === "number" && Number.isFinite(record.progress) ? Math.min(Math.max(record.progress, 0), 1) : null;
  return {
    primary: readText(record.primary, locale, 40),
    secondary: readText(record.secondary, locale, 80),
    caption: readText(record.caption, locale, 120),
    progress,
    tone: TONES.find((tone) => tone === record.tone) ?? "neutral",
    actions: readActions(record.actions, locale, 3),
  };
}
