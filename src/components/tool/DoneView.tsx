"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLocalePath, useT } from "@/i18n/client";
import { Link } from "@/i18n/Link";
import { dropboxEnabled, googleEnabled, saveToDropbox, saveToGoogleDrive } from "@/lib/cloud-pickers";
import { handOff } from "@/lib/handoff";
import { formatBytes } from "@/lib/pdf-client";
import { TOOL_BY_SLUG, type Tool } from "@/lib/tools";
import { Icon } from "../Icon";
import { ToolIcon } from "../ToolIcon";
import type { ProcessResult } from "./useProcess";

const DONE_TITLES: Record<string, string> = {
  "merge-pdf": "PDFs have been merged!",
  "split-pdf": "PDF has been split!",
  "remove-pages": "Pages have been removed!",
  "extract-pages": "Pages have been extracted!",
  "compress-pdf": "PDFs have been compressed!",
  "organize-pdf": "PDF has been organized!",
  "rotate-pdf": "PDFs have been rotated!",
  "protect-pdf": "PDFs have been protected!",
  "unlock-pdf": "PDFs have been unlocked!",
  "add-watermark": "Watermark has been added!",
  "add-page-numbers": "Page numbers have been added!",
  "repair-pdf": "PDFs have been repaired!",
  "ocr-pdf": "Your PDF is now searchable!",
  "sign-pdf": "Your document has been signed!",
  "edit-pdf": "Your PDF has been edited!",
  "redact-pdf": "Your PDF has been redacted!",
  "crop-pdf": "Your PDF has been cropped!",
  "pdf-forms": "Your form has been saved!",
  "create-workflow": "Your workflow is complete!",
};

const NEXT_TOOLS = [
  "merge-pdf", "split-pdf", "compress-pdf", "rotate-pdf", "add-watermark", "remove-pages",
  "add-page-numbers", "protect-pdf", "sign-pdf", "edit-pdf", "pdf-to-word", "organize-pdf", "ocr-pdf",
];

export function DoneView({ tool, result, onBack }: { tool: Tool; result: ProcessResult; onBack: () => void }) {
  const t = useT();
  const lp = useLocalePath();
  const router = useRouter();
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ where: string; link?: string | null } | null>(null);
  const autoStarted = useRef(false);

  // Start the download automatically once.
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    const a = document.createElement("a");
    a.href = result.downloadUrl;
    a.download = result.fileName;
    a.click();
  }, [result]);

  const title = DONE_TITLES[tool.slug] ? t(DONE_TITLES[tool.slug]) : t("{tool} complete!", { tool: tool.name });
  const smaller = tool.slug === "compress-pdf" && result.inputSize > 0
    ? Math.max(0, Math.round((1 - result.size / result.inputSize) * 100))
    : null;

  async function remove() {
    setBusy("delete");
    await fetch(`/api/jobs/${result.jobId}`, { method: "DELETE" }).catch(() => null);
    setDeleted(true);
    setBusy(null);
  }

  async function fetchResult() {
    const res = await fetch(result.downloadUrl);
    if (!res.ok) throw new Error();
    return res.blob();
  }

  async function continueWith(slug: string) {
    setBusy(slug);
    setError(null);
    try {
      handOff([new File([await fetchResult()], result.fileName, { type: "application/pdf" })]);
      router.push(lp(`/${slug}`));
    } catch {
      setError(t("The result is no longer available. Run the tool again."));
      setBusy(null);
    }
  }

  async function saveTo(where: "drive" | "dropbox") {
    setBusy(where);
    setError(null);
    try {
      if (where === "drive") {
        setSaved({ where: "Google Drive", link: await saveToGoogleDrive(await fetchResult(), result.fileName) });
      } else if (await saveToDropbox(new URL(result.downloadUrl, window.location.origin).href, result.fileName)) {
        setSaved({ where: "Dropbox" });
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? t(e.message) : t("The result is no longer available. Run the tool again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-1 flex-col items-center px-4 pt-12 pb-20 text-center">
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {smaller !== null && (
        <p className="mt-3 text-lg text-muted">
          {t("Your PDF is now {pct}% smaller", { pct: smaller })} · {formatBytes(result.inputSize)} → {formatBytes(result.size)}
        </p>
      )}
      <div className="mt-8 flex items-center gap-3">
        <button onClick={onBack} className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white hover:border-ink/40" title={t("Back")}>
          <Icon name="arrow-left" size={22} className="rtl:rotate-180" />
        </button>
        {deleted ? (
          <p className="rounded-xl bg-white px-8 py-5 text-lg font-semibold text-muted">{t("Your files have been deleted.")}</p>
        ) : (
          <a
            href={result.downloadUrl}
            download={result.fileName}
            className="flex items-center gap-3 rounded-xl bg-brand px-10 py-5 text-xl font-semibold text-white shadow-lg shadow-brand/30 hover:bg-brand-dark"
          >
            <Icon name="download" size={26} />
            {result.count > 1 ? t("Download files") : t("Download {type}", { type: result.fileName.split(".").pop()?.toUpperCase() ?? "" })}
          </a>
        )}
        {!deleted && (
          <div className="flex flex-col gap-2">
            {googleEnabled && (
              <button
                onClick={() => saveTo("drive")}
                disabled={busy !== null}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white hover:border-ink/40"
                title={t("Save to Google Drive")}
              >
                <Icon name="brand-google-drive" size={20} />
              </button>
            )}
            {dropboxEnabled && (
              <button
                onClick={() => saveTo("dropbox")}
                disabled={busy !== null}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white hover:border-ink/40"
                title={t("Save to Dropbox")}
              >
                <Icon name="brand-dropbox" size={20} />
              </button>
            )}
            <button
              onClick={remove}
              disabled={busy === "delete"}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-brand hover:border-brand"
              title={t("Delete files now")}
            >
              <Icon name="trash" size={20} />
            </button>
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-muted">
        {result.fileName} · {formatBytes(result.size)}
        {result.count > 1 && ` · ${t("{n} files in a ZIP", { n: result.count })}`}
      </p>
      {busy === "drive" || busy === "dropbox" ? <p className="mt-2 text-sm text-muted">{t("Saving…")}</p> : null}
      {saved && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#4a8a32]">
          <Icon name="check" size={16} /> {t("Saved to {where}.", { where: saved.where })}
          {saved.link && <a href={saved.link} target="_blank" rel="noreferrer" className="underline">{t("Open")}</a>}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-brand">{error}</p>}

      {result.continuable && !deleted && (
        <div className="mt-14 w-full max-w-3xl">
          <h2 className="text-xl font-bold">{t("Continue to…")}</h2>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {NEXT_TOOLS.filter((s) => s !== tool.slug).slice(0, 8).map((s) => {
              const next = TOOL_BY_SLUG.get(s)!;
              return (
                <button
                  key={s}
                  onClick={() => continueWith(s)}
                  disabled={busy !== null}
                  className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-start text-sm font-medium hover:border-ink/30 hover:shadow"
                >
                  <ToolIcon tool={next} size={30} />
                  {busy === s ? t("Opening…") : t(next.name)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="mt-12 flex items-center gap-2 text-sm text-muted">
        <Icon name="shield-check" size={18} /> {t("Files are deleted from our server automatically after 1 hour.")}{" "}
        <Link href="/security" className="underline">{t("Learn more")}</Link>
      </p>
    </section>
  );
}
