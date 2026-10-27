"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { optionVisible, POSITION_VALUES, type ToolOption } from "@/lib/tools";
import { IconInput } from "@/components/ui/IconInput";

export type OptionValues = Record<string, string | number | boolean>;

export function defaultValues(options: ToolOption[] = []): OptionValues {
  const v: OptionValues = {};
  for (const o of options) if (o.type !== "file") v[o.key] = o.default;
  return v;
}

/** Searchable checkbox list; the value is the chosen codes joined with "+". */
function MultiPicker({
  options,
  max,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  max: number;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const selected = value.split("+").filter(Boolean);
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    if (next.length && next.length <= max) onChange(next.join("+"));
  };
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {selected.map((v) => (
          <span key={v} className="rounded-full bg-ink px-2.5 py-0.5 text-xs text-white">
            {options.find((o) => o.value === v)?.label ?? v}
          </span>
        ))}
      </div>
      <IconInput icon="search" type="search" wrapperClassName="mb-2" className="!py-1.5 text-sm" placeholder={t("Search languages")} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-line p-1.5">
        {shown.map((o) => {
          const checked = selected.includes(o.value);
          const disabled = !checked && selected.length >= max;
          return (
            <label key={o.value} className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${disabled ? "opacity-40" : "cursor-pointer hover:bg-bg"}`}>
              <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={checked} disabled={disabled} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-muted">{t("Pick every language that appears in the document (at most {max}).", { max })}</p>
    </div>
  );
}

export function OptionsForm({
  options,
  values,
  onChange,
  extras,
  onExtra,
}: {
  options: ToolOption[];
  values: OptionValues;
  onChange: (key: string, value: string | number | boolean) => void;
  extras: Record<string, File>;
  onExtra: (key: string, file: File | null) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-5">
      {options.filter((o) => optionVisible(o, values)).map((o) => (
        <div key={o.key}>
          {o.type !== "checkbox" && <p className="mb-2 text-sm font-semibold text-ink">{o.label}</p>}
          {o.type === "choice" && (
            <div className="grid gap-2">
              {o.choices.map((c) => {
                const active = values[o.key] === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => onChange(o.key, c.value)}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-start transition ${
                      active ? "border-brand bg-brand/5" : "border-line bg-white hover:border-ink/30"
                    }`}
                  >
                    <span
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                        active ? "border-brand bg-[radial-gradient(var(--brand)_45%,transparent_50%)]" : "border-line"
                      }`}
                    />
                    <span>
                      <span className="block text-sm font-medium">{c.label}</span>
                      {c.hint && <span className="block text-xs text-muted">{c.hint}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {(o.type === "text" || o.type === "password") && (
            <>
              <IconInput
                icon={o.type === "password" ? "lock" : "pencil"}
                type={o.type}
                value={String(values[o.key] ?? "")}
                placeholder={o.placeholder}
                onChange={(e) => onChange(o.key, e.target.value)}
                autoComplete={o.type === "password" ? "new-password" : "off"}
              />
              {o.hint && <p className="mt-1 text-xs text-muted">{o.hint}</p>}
            </>
          )}
          {o.type === "number" && (
            <input
              className="input"
              type="number"
              value={String(values[o.key] ?? "")}
              min={o.min}
              max={o.max}
              step={o.step ?? 1}
              onChange={(e) => onChange(o.key, e.target.value === "" ? "" : Number(e.target.value))}
            />
          )}
          {o.type === "checkbox" && (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand)]"
                checked={Boolean(values[o.key])}
                onChange={(e) => onChange(o.key, e.target.checked)}
              />
              {o.label}
            </label>
          )}
          {o.type === "multi" && (
            <MultiPicker
              options={o.choices}
              max={o.max}
              value={String(values[o.key] ?? "")}
              onChange={(v) => onChange(o.key, v)}
            />
          )}
          {o.type === "color" && (
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={String(values[o.key])}
                onChange={(e) => onChange(o.key, e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-line"
              />
              <span className="font-mono text-sm text-muted">{String(values[o.key])}</span>
            </div>
          )}
          {o.type === "position" && (
            <div className="grid w-32 grid-cols-3 gap-1.5 rounded-lg border border-line bg-white p-2">
              {POSITION_VALUES.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={t("Position {p}", { p })}
                  onClick={() => onChange(o.key, p)}
                  className={`h-8 rounded ${values[o.key] === p ? "bg-brand" : "bg-bg hover:bg-line"}`}
                />
              ))}
            </div>
          )}
          {o.type === "file" && (
            <div>
              <input
                type="file"
                accept={o.accept}
                onChange={(e) => onExtra(o.key, e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:font-semibold file:text-white"
              />
              {extras[o.key] && <p className="mt-1 text-xs text-muted">{extras[o.key].name}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
