"use client";

import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import { localizeOption } from "@/i18n/tools";
import { Icon } from "../../Icon";
import { OptionsForm, defaultValues, type OptionValues } from "../OptionsForm";
import { ErrorBanner, type EditorProps } from "../ToolRunner";
import type { ToolOption } from "@/lib/tools";

const OPTIONS: ToolOption[] = [
  {
    type: "choice",
    key: "screenWidth",
    label: "Screen size",
    default: "desktop",
    choices: [
      { value: "desktop", label: "Desktop", hint: "1440 px" },
      { value: "tablet", label: "Tablet", hint: "768 px" },
      { value: "mobile", label: "Mobile", hint: "375 px" },
    ],
  },
  { type: "checkbox", key: "onePage", label: "One long page (no page breaks)", default: false },
  {
    type: "choice",
    key: "pageSize",
    label: "Page size",
    default: "a4",
    showIf: { key: "onePage", equals: "false" },
    choices: [
      { value: "a4", label: "A4" },
      { value: "letter", label: "US Letter" },
    ],
  },
  {
    type: "choice",
    key: "orientation",
    label: "Orientation",
    default: "portrait",
    showIf: { key: "onePage", equals: "false" },
    choices: [
      { value: "portrait", label: "Portrait" },
      { value: "landscape", label: "Landscape" },
    ],
  },
  {
    type: "choice",
    key: "margin",
    label: "Margin",
    default: "small",
    showIf: { key: "onePage", equals: "false" },
    choices: [
      { value: "none", label: "No margin" },
      { value: "small", label: "Small" },
      { value: "big", label: "Big" },
    ],
  },
];

export default function HtmlEditor({ tool, submit, error, setError }: EditorProps) {
  const t = useT();
  const options = useMemo(() => OPTIONS.map((o) => localizeOption(o, t)), [t]);
  const [url, setUrl] = useState("");
  const [values, setValues] = useState<OptionValues>(() => defaultValues(OPTIONS));

  function go(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return setError(t("Paste the address of the web page you want to convert."));
    submit([], { ...values, url: url.trim() });
  }

  return (
    <section className="flex flex-1 flex-col items-center px-4 pt-14 pb-20">
      <h1 className="text-center text-3xl font-bold sm:text-[42px]">{tool.title}</h1>
      <p className="mt-4 max-w-2xl text-center text-lg text-muted">{tool.subtitle}</p>
      <ErrorBanner message={error} />
      <form onSubmit={go} className="mt-8 w-full max-w-2xl rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <label className="text-sm font-semibold" htmlFor="url">{t("Website URL")}</label>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-line px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <Icon name="world-www" size={22} className="text-muted" />
          <input
            id="url"
            className="w-full py-3 outline-none"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            autoFocus
          />
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <OptionsForm
            options={options.slice(0, 2)}
            values={values}
            onChange={(k, v) => setValues((c) => ({ ...c, [k]: v }))}
            extras={{}}
            onExtra={() => {}}
          />
          <OptionsForm
            options={options.slice(2)}
            values={values}
            onChange={(k, v) => setValues((c) => ({ ...c, [k]: v }))}
            extras={{}}
            onExtra={() => {}}
          />
        </div>
        <button className="btn-primary mt-8 w-full !py-4 text-lg">
          {tool.action} <Icon name="arrow-right" size={22} className="rtl:rotate-180" />
        </button>
      </form>
    </section>
  );
}
