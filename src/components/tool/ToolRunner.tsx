"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { clearHandOff, peekHandOff } from "@/lib/handoff";
import { TOOL_BY_SLUG, type Tool } from "@/lib/tools";
import { Icon } from "../Icon";
import { ToolIcon } from "../ToolIcon";
import { DoneView } from "./DoneView";
import { toItems, type FileItem } from "./FileCards";
import { GenericWorkspace } from "./GenericWorkspace";
import { ProcessingView } from "./ProcessingView";
import { acceptsFile, SelectFiles } from "./SelectFiles";
import { useProcess } from "./useProcess";

export type Submit = (files: File[], options: Record<string, unknown>, extras?: Record<string, Blob>) => void;

export type EditorProps = {
  tool: Tool;
  items: FileItem[];
  setItems: (items: FileItem[]) => void;
  addFiles: (files: File[]) => void;
  submit: Submit;
  error?: string;
  setError: (msg: string) => void;
};

const load = (importer: () => Promise<{ default: ComponentType<EditorProps> }>) =>
  dynamic<EditorProps>(importer, {
    ssr: false,
    loading: () => <p className="p-10 text-center text-muted">Loading editor…</p>,
  });

const EDITORS: Record<NonNullable<Tool["editor"]>, ComponentType<EditorProps>> = {
  organize: load(() => import("./editors/OrganizeEditor")),
  rotate: load(() => import("./editors/RotateEditor")),
  edit: load(() => import("./editors/EditEditor")),
  sign: load(() => import("./editors/SignEditor")),
  redact: load(() => import("./editors/RedactEditor")),
  crop: load(() => import("./editors/CropEditor")),
  forms: load(() => import("./editors/FormsEditor")),
  compare: load(() => import("./editors/CompareEditor")),
  scan: load(() => import("./editors/ScanEditor")),
  html: load(() => import("./editors/HtmlEditor")),
  workflow: load(() => import("./editors/WorkflowEditor")),
};

/** Editors that collect their own input instead of starting with a file picker. */
const NO_PICKER = new Set(["scan", "html", "workflow"]);

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="mx-auto mt-4 flex max-w-3xl items-start gap-2 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-brand">
      <Icon name="alert-triangle" size={18} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Unavailable({ tool }: { tool: Tool }) {
  return (
    <section className="flex flex-1 flex-col items-center px-4 pt-16 pb-24 text-center">
      <ToolIcon tool={tool} size={64} />
      <h1 className="mt-6 text-3xl font-bold sm:text-4xl">{tool.title}</h1>
      <p className="mt-3 max-w-xl text-lg text-muted">{tool.subtitle}</p>
      <div className="mt-8 flex items-center gap-3 rounded-xl border border-line bg-white px-6 py-4">
        <Icon name="cloud-off" size={26} className="text-muted" />
        <p className="text-left font-medium">{tool.unavailable}</p>
      </div>
      <Link href="/" className="btn-secondary mt-8">
        <Icon name="arrow-left" size={18} /> Explore other tools
      </Link>
    </section>
  );
}

export function ToolRunner({ slug }: { slug: string }) {
  const tool = TOOL_BY_SLUG.get(slug)!;
  // Start with any file passed from the previous tool's "Continue to…" buttons.
  const [items, setItems] = useState<FileItem[]>(() => {
    const handed = (peekHandOff() ?? []).filter((f) => acceptsFile(tool, f));
    return toItems(tool.multiple ? handed : handed.slice(0, 1));
  });
  const { state, run, reset, setError } = useProcess(slug);
  useEffect(clearHandOff, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const ok = files.filter((f) => acceptsFile(tool, f));
      if (ok.length < files.length) setError(`Some files were skipped. This tool accepts ${tool.acceptLabel}.`);
      if (!ok.length) return;
      setItems((prev) => (tool.multiple ? [...prev, ...toItems(ok)] : toItems(ok.slice(0, 1))));
    },
    [tool, setError],
  );

  if (tool.unavailable) return <Unavailable tool={tool} />;
  if (state.phase === "uploading" || state.phase === "processing") return <ProcessingView state={state} toolName={tool.action} />;
  if (state.phase === "done") return <DoneView tool={tool} result={state.result} onBack={reset} />;

  const error = state.phase === "idle" ? state.error : undefined;
  if (!items.length && !(tool.editor && NO_PICKER.has(tool.editor))) {
    return (
      <>
        <ErrorBanner message={error} />
        <SelectFiles tool={tool} onFiles={addFiles} onError={setError} />
      </>
    );
  }

  const props: EditorProps = { tool, items, setItems, addFiles, submit: run, error, setError };
  const Editor = tool.editor ? EDITORS[tool.editor] : GenericWorkspace;
  return <Editor {...props} />;
}
