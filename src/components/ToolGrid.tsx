import { TOOLS } from "@/lib/tools";
import { HoverLink } from "./HoverLink";
import { ToolFilter } from "./ToolFilter";
import { ToolIcon } from "./ToolIcon";

/**
 * Server-rendered tool cards. Only the small filter bar is a client component;
 * it hides cards with CSS (see globals.css), so the cards ship no JavaScript.
 */
export function ToolGrid() {
  return (
    <ToolFilter>
      <div className="tool-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {TOOLS.map((t) => (
          <HoverLink
            key={t.slug}
            href={`/${t.slug}`}
            data-cat={t.category}
            className="group relative flex min-h-56 flex-col rounded-xl border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-lg"
          >
            {(t.isNew || t.unavailable) && (
              <span
                className={`absolute top-4 right-4 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                  t.unavailable ? "bg-bg text-muted" : "bg-brand/10 text-brand-dark"
                }`}
              >
                {t.unavailable ? "Unavailable" : "New!"}
              </span>
            )}
            <ToolIcon tool={t} />
            <h2 className="mt-5 text-xl font-semibold text-ink">{t.name}</h2>
            <p className="mt-2 text-sm leading-5 text-muted">{t.description}</p>
          </HoverLink>
        ))}
      </div>
    </ToolFilter>
  );
}
