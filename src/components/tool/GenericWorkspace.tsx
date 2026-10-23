"use client";

import { useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { imageToJpeg } from "@/lib/pdf-client";
import { optionVisible } from "@/lib/tools";
import { Icon } from "../Icon";
import { FileCards } from "./FileCards";
import { defaultValues, OptionsForm, type OptionValues } from "./OptionsForm";
import { useFilePicker } from "./SelectFiles";
import { ErrorBanner, type EditorProps } from "./ToolRunner";

/** Two-pane tool layout: work area on the left, options sidebar on the right. */
export function Workspace({
  title,
  main,
  sidebar,
  action,
  onAction,
  disabled,
  error,
}: {
  title: string;
  main: ReactNode;
  sidebar: ReactNode;
  action: string;
  onAction: () => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <div className="flex-1 overflow-auto bg-bg p-4 sm:p-8">
        <ErrorBanner message={error} />
        <div className="mt-4">{main}</div>
      </div>
      <aside className="flex w-full shrink-0 flex-col border-s border-line bg-white lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:w-[380px]">
        <h2 className="border-b border-line px-6 py-5 text-center text-2xl font-bold">{title}</h2>
        <div className="flex-1 overflow-y-auto px-6 py-5">{sidebar}</div>
        <div className="border-t border-line p-5">
          <button onClick={onAction} disabled={disabled} className="btn-primary w-full !py-4 text-lg">
            {action} <Icon name="arrow-right" size={22} className="rtl:rotate-180" />
          </button>
        </div>
      </aside>
    </div>
  );
}

const IMAGE_TOOLS = new Set(["jpg-to-pdf", "scan-to-pdf"]);

export function GenericWorkspace({ tool, items, setItems, addFiles, submit, error, setError }: EditorProps) {
  const t = useT();
  const [values, setValues] = useState<OptionValues>(() => defaultValues(tool.options));
  const [extras, setExtras] = useState<Record<string, File>>({});
  const [preparing, setPreparing] = useState(false);
  const picker = useFilePicker(tool, addFiles);
  const isMerge = tool.slug === "merge-pdf";

  async function go() {
    const min = tool.minFiles ?? 1;
    if (items.length < min) return setError(t("Select at least {n} files.", { n: min }));
    for (const o of tool.options ?? []) {
      if ((o.type === "text" || o.type === "password") && o.required && optionVisible(o, values) && !String(values[o.key]).trim()) {
        return setError(t('Fill in "{field}".', { field: o.label }));
      }
      if (o.type === "file" && optionVisible(o, values) && !extras[o.key]) return setError(t('Choose a file for "{field}".', { field: o.label }));
    }
    let files = items.map((i) => i.file);
    if (IMAGE_TOOLS.has(tool.slug)) {
      setPreparing(true);
      try {
        files = await Promise.all(files.map(imageToJpeg));
      } catch {
        setPreparing(false);
        return setError(t("One of the images could not be read."));
      } finally {
        setPreparing(false);
      }
    }
    const options: Record<string, unknown> = { ...values };
    if (isMerge) options.rotations = Object.fromEntries(items.map((it, i) => [i, it.rotation]));
    submit(files, options, extras);
  }

  const sidebar = (
    <>
      {tool.options?.length ? (
        <OptionsForm
          options={tool.options}
          values={values}
          onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))}
          extras={extras}
          onExtra={(k, f) =>
            setExtras((cur) => {
              const next = { ...cur };
              if (f) next[k] = f;
              else delete next[k];
              return next;
            })
          }
        />
      ) : (
        <div className="rounded-lg bg-bg p-4 text-sm text-muted">
          <Icon name="info-circle" size={18} className="mb-1 inline" />{" "}
          {isMerge
            ? t("Drag and drop the files to put them in the order you want, then click Merge PDF.")
            : items.length === 1
              ? t("1 file ready. Click the button below to continue.")
              : t("{n} files ready. Click the button below to continue.", { n: items.length })}
        </div>
      )}
    </>
  );

  return (
    <Workspace
      title={tool.name}
      error={error}
      action={preparing ? t("Preparing…") : tool.action}
      disabled={preparing}
      onAction={go}
      main={
        <>
          <FileCards
            items={items}
            setItems={setItems}
            sortable={tool.multiple}
            canRotate={isMerge}
            showSort={isMerge}
            onAddMore={tool.multiple ? picker.open : undefined}
          />
          {picker.element}
        </>
      }
      sidebar={sidebar}
    />
  );
}
