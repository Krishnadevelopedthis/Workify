"use client";

import { useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { CATEGORIES, type Category } from "@/lib/tools";

/** Category tabs; the chosen category is applied to the grid via a data attribute. */
export function ToolFilter({ children }: { children: ReactNode }) {
  const t = useT();
  const [filter, setFilter] = useState<Category | "all">("all");
  return (
    <div data-filter={filter}>
      <div className="mb-8 flex flex-wrap justify-center gap-2.5" role="tablist" aria-label={t("Filter tools")}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              filter === c.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/50"
            }`}
          >
            {t(c.label)}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
