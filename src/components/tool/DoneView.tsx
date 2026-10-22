"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { handOff } from "@/lib/handoff";
import { formatBytes } from "@/lib/pdf-client";
import { TOOL_BY_SLUG, type Tool } from "@/lib/tools";
import { Icon } from "../Icon";
import { ToolIcon } from "../ToolIcon";
import type { ProcessResult } from "./useProcess";

const DONE_TITLES: Record<string, string> = {
  "merge-pdf": "PDFs have been merged!",
  "split-pdf": "PDF has been split!",
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
  "merge-pdf", "split-pdf", "compress-pdf", "rotate-pdf", "add-watermark",
  "add-page-numbers", "protect-pdf", "sign-pdf", "edit-pdf", "pdf-to-word", "organize-pdf", "ocr-pdf",
];

export function DoneView({ tool, result, onBack }: { tool: Tool; result: ProcessResult; onBack: () => void }) {
  const router = useRouter();
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  // Start the download automatically once, like the original site.
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    const a = document.createElement("a");
    a.href = result.downloadUrl;
    a.download = result.fileName;
    a.click();
  }, [result]);

  const title = DONE_TITLES[tool.slug] ?? `${tool.name} complete!`;
  const saved = tool.slug === "compress-pdf" && result.inputSize > 0
    ? Math.max(0, Math.round((1 - result.size / result.inputSize) * 100))
    : null;

  async function remove() {
    setBusy("delete");
    await fetch(`/api/jobs/${result.jobId}`, { method: "DELETE" }).catch(() => null);
    setDeleted(true);
    setBusy(null);
  }

  async function continueWith(slug: string) {
    setBusy(slug);
    setError(null);
    try {
      const res = await fetch(result.downloadUrl);
      if (!res.ok) throw new Error();
      handOff([new File([await res.blob()], result.fileName, { type: "application/pdf" })]);
      router.push(`/${slug}`);
    } catch {
      setError("The result is no longer available. Run the tool again.");
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-1 flex-col items-center px-4 pt-12 pb-20 text-center">
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {saved !== null && (
        <p className="mt-3 text-lg text-muted">
          Your PDF is now <strong className="text-ink">{saved}% smaller</strong> · {formatBytes(result.inputSize)} →{" "}
          {formatBytes(result.size)}
        </p>
      )}
      <div className="mt-8 flex items-center gap-3">
        <button onClick={onBack} className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white hover:border-ink/40" title="Back">
          <Icon name="arrow-left" size={22} />
        </button>
        {deleted ? (
          <p className="rounded-xl bg-white px-8 py-5 text-lg font-semibold text-muted">Your files have been deleted.</p>
        ) : (
          <a
            href={result.downloadUrl}
            download={result.fileName}
            className="flex items-center gap-3 rounded-xl bg-brand px-10 py-5 text-xl font-semibold text-white shadow-lg shadow-brand/30 hover:bg-brand-dark"
          >
            <Icon name="download" size={26} />
            Download {result.count > 1 ? "files" : result.fileName.split(".").pop()?.toUpperCase()}
          </a>
        )}
        {!deleted && (
          <button
            onClick={remove}
            disabled={busy === "delete"}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white text-brand hover:border-brand"
            title="Delete files now"
          >
            <Icon name="trash" size={22} />
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-muted">
        {result.fileName} · {formatBytes(result.size)}
        {result.count > 1 && ` · ${result.count} files in a ZIP`}
      </p>

      {result.continuable && !deleted && (
        <div className="mt-14 w-full max-w-3xl">
          <h2 className="text-xl font-bold">Continue to…</h2>
          {error && <p className="mt-2 text-sm text-brand">{error}</p>}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {NEXT_TOOLS.filter((s) => s !== tool.slug).slice(0, 8).map((s) => {
              const t = TOOL_BY_SLUG.get(s)!;
              return (
                <button
                  key={s}
                  onClick={() => continueWith(s)}
                  disabled={busy !== null}
                  className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-left text-sm font-medium hover:border-ink/30 hover:shadow"
                >
                  <ToolIcon tool={t} size={30} />
                  {busy === s ? "Opening…" : t.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="mt-12 flex items-center gap-2 text-sm text-muted">
        <Icon name="shield-check" size={18} /> Files are deleted from our server automatically after 1 hour.{" "}
        <Link href="/security" className="underline">Learn more</Link>
      </p>
    </section>
  );
}
