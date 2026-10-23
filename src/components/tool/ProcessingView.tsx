"use client";

import dynamic from "next/dynamic";
import { useT } from "@/i18n/client";
import animation from "@/lib/processing-lottie.json";
import type { ProcessState } from "./useProcess";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), { ssr: false });

export function ProcessingView({ state, toolName }: { state: ProcessState; toolName: string }) {
  const t = useT();
  const uploading = state.phase === "uploading";
  const pct = uploading ? Math.round(state.progress * 100) : 100;
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <div className="h-36 w-36">
        <Lottie src={animation} autoplay loop />
      </div>
      <h2 className="mt-4 text-2xl font-bold">{uploading ? t("Uploading files…") : `${toolName}…`}</h2>
      <p className="mt-2 text-muted">{uploading ? `${pct}%` : t("Hang tight, this can take a moment for big files.")}</p>
      <div className="mt-6 h-2 w-72 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full bg-brand transition-all ${uploading ? "" : "animate-pulse"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </section>
  );
}
