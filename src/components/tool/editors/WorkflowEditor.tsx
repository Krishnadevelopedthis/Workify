"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { localizeOption } from "@/i18n/tools";
import { deleteWorkflow, listWorkflows, saveWorkflow, type WorkflowStep } from "@/app/actions/workflows";
import { optionVisible, TOOL_BY_SLUG, WORKFLOW_STEPS, workflowStepOptions } from "@/lib/tools";
import { Icon } from "../../Icon";
import { ToolIcon } from "../../ToolIcon";
import { FileCards } from "../FileCards";
import { Workspace } from "../GenericWorkspace";
import { defaultValues, OptionsForm } from "../OptionsForm";
import { useFilePicker } from "../SelectFiles";
import type { EditorProps } from "../ToolRunner";
import { IconInput } from "@/components/ui/IconInput";

type Step = WorkflowStep & { key: number };
type Saved = { id: number | string; name: string; steps: WorkflowStep[] };

let k = 0;
const newStep = (tool: string, options?: Record<string, unknown>): Step => ({
  key: ++k,
  tool,
  options: options ?? defaultValues(workflowStepOptions(tool)),
});

const LOCAL_KEY = "workify.workflows";
function readLocal(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeLocal(list: Saved[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    // storage blocked: saving just won't persist
  }
}

export default function WorkflowEditor({ tool, items, setItems, addFiles, submit, error, setError }: EditorProps) {
  const t = useT();
  const [steps, setSteps] = useState<Step[]>([newStep("compress-pdf"), newStep("add-page-numbers")]);
  const [open, setOpen] = useState<number | null>(null);
  const [name, setName] = useState(() => t("My workflow"));
  const [saved, setSaved] = useState<Saved[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const picker = useFilePicker(tool, addFiles);

  const applyList = (server: Saved[] | null) => {
    setSignedIn(server !== null);
    setSaved(server ?? readLocal());
  };
  const refresh = async () => applyList(await listWorkflows());
  useEffect(() => {
    listWorkflows().then(applyList);
  }, []);

  const update = (key: number, patch: Partial<Step>) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) =>
    setSteps((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const plain = () => steps.map(({ tool: slug, options }) => ({ tool: slug, options }));

  async function save() {
    setNotice(null);
    if (signedIn) {
      const r = await saveWorkflow(name, plain());
      if (r.error) return setError(r.error);
    } else {
      // Passwords are never stored, even locally.
      const clean = plain().map((s) => ({ ...s, options: { ...s.options, password: undefined, repeat: undefined } }));
      writeLocal([{ id: `local-${Date.now()}`, name: name.trim() || t("My workflow"), steps: clean }, ...readLocal()]);
    }
    setNotice(signedIn ? t("Saved to your account.") : t("Saved in this browser. Log in to keep workflows in your account."));
    await refresh();
  }

  async function remove(w: Saved) {
    if (typeof w.id === "number") await deleteWorkflow(w.id);
    else writeLocal(readLocal().filter((x) => x.id !== w.id));
    await refresh();
  }

  function run() {
    if (!steps.length) return setError(t("Add at least one tool to your workflow."));
    if (!items.length) return setError(t("Select the PDF files to run the workflow on."));
    for (const s of steps) {
      for (const o of workflowStepOptions(s.tool)) {
        if (o.type === "password" && optionVisible(o, s.options) && !String(s.options[o.key] ?? "")) {
          setOpen(s.key);
          return setError(t("Fill in the password for the {tool} step.", { tool: t(TOOL_BY_SLUG.get(s.tool)!.name) }));
        }
      }
    }
    submit(items.map((i) => i.file), { steps: plain() });
  }

  return (
    <Workspace
      title={tool.name}
      error={error}
      action={tool.action}
      onAction={run}
      main={
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold">{tool.title}</h1>
          <p className="mt-1 text-muted">{tool.subtitle}</p>

          <ol className="mt-6 space-y-3">
            {steps.map((s, i) => {
              const stepTool = TOOL_BY_SLUG.get(s.tool)!;
              const options = workflowStepOptions(s.tool).map((o) => localizeOption(o, t));
              return (
                <li key={s.key} className="rounded-xl border border-line bg-white">
                  <div className="flex items-center gap-3 p-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">{i + 1}</span>
                    <ToolIcon tool={stepTool} size={32} />
                    <select
                      className="input !w-auto flex-1"
                      value={s.tool}
                      onChange={(e) => update(s.key, { tool: e.target.value, options: defaultValues(workflowStepOptions(e.target.value)) })}
                      aria-label={t("Step {n} tool", { n: i + 1 })}
                    >
                      {WORKFLOW_STEPS.map((slug) => <option key={slug} value={slug}>{t(TOOL_BY_SLUG.get(slug)!.name)}</option>)}
                    </select>
                    {options.length > 0 && (
                      <button onClick={() => setOpen(open === s.key ? null : s.key)} className="rounded-lg p-2 hover:bg-bg" title={t("Settings")}>
                        <Icon name="settings" size={18} />
                      </button>
                    )}
                    <button onClick={() => move(i, -1)} className="rounded-lg p-2 hover:bg-bg" title={t("Move up")}><Icon name="arrow-left" size={18} className="rotate-90" /></button>
                    <button onClick={() => move(i, 1)} className="rounded-lg p-2 hover:bg-bg" title={t("Move down")}><Icon name="arrow-right" size={18} className="rotate-90" /></button>
                    <button onClick={() => setSteps((all) => all.filter((x) => x.key !== s.key))} className="rounded-lg p-2 text-brand hover:bg-bg" title={t("Remove step")}><Icon name="trash" size={18} /></button>
                  </div>
                  {open === s.key && options.length > 0 && (
                    <div className="border-t border-line p-4">
                      <OptionsForm
                        options={options}
                        values={s.options as Record<string, string | number | boolean>}
                        onChange={(key, v) => update(s.key, { options: { ...s.options, [key]: v } })}
                        extras={{}}
                        onExtra={() => {}}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {steps.length < 10 && (
            <button className="btn-secondary mt-3 w-full border-dashed" onClick={() => setSteps((s) => [...s, newStep("protect-pdf")])}>
              <Icon name="plus" size={18} /> {t("Add a tool")}
            </button>
          )}

          <h2 className="mt-10 mb-3 text-lg font-bold">{t("Files to process")}</h2>
          {items.length ? (
            <FileCards items={items} setItems={setItems} sortable={false} canRotate={false} onAddMore={picker.open} />
          ) : (
            <button onClick={picker.open} className="btn-primary !px-8 !py-4">{t("Select PDF files")}</button>
          )}
          {picker.element}
        </div>
      }
      sidebar={
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold">{t("Save this workflow")}</p>
            <div className="flex gap-2">
              <IconInput icon="pencil" wrapperClassName="min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label={t("Workflow name")} />
              <button className="btn-secondary !px-3" onClick={save} title={t("Save")}><Icon name="device-floppy" size={18} /></button>
            </div>
            {notice && <p className="mt-2 text-xs text-[#4a8a32]">{notice}</p>}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{signedIn ? t("My workflows") : t("Saved in this browser")}</p>
            {saved.length === 0 ? (
              <p className="text-xs text-muted">{t("No saved workflows yet.")}</p>
            ) : (
              <ul className="space-y-2">
                {saved.map((w) => (
                  <li key={w.id} className="flex items-center gap-2 rounded-lg border border-line p-2">
                    <button
                      className="flex-1 text-start"
                      onClick={() => {
                        setSteps(w.steps.map((s) => newStep(s.tool, { ...defaultValues(workflowStepOptions(s.tool)), ...s.options })));
                        setName(w.name);
                      }}
                    >
                      <span className="block text-sm font-semibold">{w.name}</span>
                      <span className="block text-xs text-muted">{w.steps.map((s) => t(TOOL_BY_SLUG.get(s.tool)?.name ?? s.tool)).join(" → ")}</span>
                    </button>
                    <button onClick={() => remove(w)} className="p-1 text-brand" title={t("Delete")}><Icon name="trash" size={16} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      }
    />
  );
}
