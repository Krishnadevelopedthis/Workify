"use client";

import { useCallback, useState } from "react";
import { useLang, useT } from "@/i18n/client";

export type ProcessResult = {
  jobId: string;
  fileName: string;
  size: number;
  inputSize: number;
  count: number;
  downloadUrl: string;
  continuable: boolean;
};

export type ProcessState =
  | { phase: "idle"; error?: string }
  | { phase: "uploading"; progress: number }
  | { phase: "processing" }
  | { phase: "done"; result: ProcessResult };

/** Uploads files + options to /api/process/<slug>, reporting upload progress. */
export function useProcess(slug: string) {
  const t = useT();
  const lang = useLang();
  const [state, setState] = useState<ProcessState>({ phase: "idle" });

  const run = useCallback(
    (files: File[], options: Record<string, unknown>, extras: Record<string, Blob> = {}) => {
      const form = new FormData();
      files.forEach((f) => form.append("files", f, f.name));
      form.append("options", JSON.stringify(options));
      Object.entries(extras).forEach(([k, v]) =>
        form.append(`extra:${k}`, v, v instanceof File ? v.name : `${k}.png`),
      );

      setState({ phase: "uploading", progress: 0 });
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/process/${slug}`);
      // Error messages come back in the visitor's language.
      xhr.setRequestHeader("x-wf-lang", lang);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setState({ phase: "uploading", progress: e.loaded / e.total });
      };
      xhr.upload.onload = () => setState({ phase: "processing" });
      xhr.onload = () => {
        let body: { error?: string } & Partial<ProcessResult> = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          // fall through to the generic message
        }
        if (xhr.status >= 200 && xhr.status < 300 && body.jobId) {
          setState({ phase: "done", result: body as ProcessResult });
        } else {
          setState({ phase: "idle", error: body.error ?? t("Something went wrong. Please try again.") });
        }
      };
      xhr.onerror = () => setState({ phase: "idle", error: t("Network error. Check your connection and try again.") });
      xhr.send(form);
    },
    [slug, lang, t],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  const setError = useCallback((error: string) => setState({ phase: "idle", error }), []);
  return { state, run, reset, setError };
}
