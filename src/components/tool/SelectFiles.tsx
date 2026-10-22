"use client";

import { useEffect, useRef, useState } from "react";
import { dropboxEnabled, googleEnabled, pickFromDropbox, pickFromGoogleDrive } from "@/lib/cloud-pickers";
import type { Tool } from "@/lib/tools";
import { Icon } from "../Icon";

export function acceptsFile(tool: Tool, file: File) {
  const parts = tool.accept.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const name = file.name.toLowerCase();
  return parts.some((p) =>
    p.startsWith(".") ? name.endsWith(p) : p.endsWith("/*") ? file.type.startsWith(p.slice(0, -1)) : file.type === p,
  );
}

function extensions(tool: Tool) {
  return tool.accept.split(",").map((s) => s.trim()).filter((s) => s.startsWith("."));
}

/** Hidden <input type=file> plus helpers, shared by the hero and "add more" buttons. */
export function useFilePicker(tool: Tool, onFiles: (files: File[]) => void) {
  const input = useRef<HTMLInputElement>(null);
  const element = (
    <input
      ref={input}
      type="file"
      hidden
      accept={tool.accept}
      multiple={tool.multiple}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length) onFiles(files);
      }}
    />
  );
  return { open: () => input.current?.click(), element };
}

export function SelectFiles({
  tool,
  onFiles,
  onError,
}: {
  tool: Tool;
  onFiles: (files: File[]) => void;
  onError: (msg: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const picker = useFilePicker(tool, onFiles);

  // Accept drops anywhere on the page, like the original.
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        depth++;
        setDragging(true);
      }
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const ok = files.filter((f) => acceptsFile(tool, f));
      if (files.length && !ok.length) onError(`Please drop ${tool.acceptLabel}.`);
      else if (ok.length) onFiles(tool.multiple ? ok : ok.slice(0, 1));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [tool, onFiles, onError]);

  const cloud = async (fn: () => Promise<File[]>) => {
    setCloudBusy(true);
    try {
      const files = await fn();
      if (files.length) onFiles(files);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not get files from the cloud.");
    } finally {
      setCloudBusy(false);
    }
  };

  const plural = tool.multiple ? "files" : "file";
  const label = tool.acceptLabel.replace(/s$/, "");

  return (
    <section className="flex flex-1 flex-col items-center px-4 pt-14 pb-20 text-center">
      <h1 className="text-3xl font-bold text-ink sm:text-[42px]">{tool.title}</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted sm:text-xl">{tool.subtitle}</p>
      <div className="mt-10 flex items-center gap-3">
        <button
          onClick={picker.open}
          disabled={cloudBusy}
          className="rounded-xl bg-brand px-10 py-6 text-xl font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark sm:px-16"
        >
          Select {label} {plural}
        </button>
        {(googleEnabled || dropboxEnabled) && (
          <div className="flex flex-col gap-2">
            {googleEnabled && (
              <button
                title={`Select ${label} from Google Drive`}
                disabled={cloudBusy}
                onClick={() => cloud(() => pickFromGoogleDrive(tool.multiple, tool.accept.includes("pdf") ? "application/pdf" : ""))}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow hover:bg-brand-dark"
              >
                <Icon name="brand-google-drive" size={22} />
              </button>
            )}
            {dropboxEnabled && (
              <button
                title={`Select ${label} from Dropbox`}
                disabled={cloudBusy}
                onClick={() => cloud(() => pickFromDropbox(tool.multiple, extensions(tool)))}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow hover:bg-brand-dark"
              >
                <Icon name="brand-dropbox" size={22} />
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mt-4 text-sm text-muted">or drop {tool.acceptLabel} here</p>
      {cloudBusy && <p className="mt-2 text-sm text-muted">Getting your files…</p>}
      {picker.element}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-brand/90 text-3xl font-bold text-white">
          <div className="flex flex-col items-center gap-4">
            <Icon name="upload" size={64} />
            Drop {tool.acceptLabel} here
          </div>
        </div>
      )}
    </section>
  );
}
