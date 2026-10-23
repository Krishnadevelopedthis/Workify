import { getT } from "@/i18n/server";
import { TOOLS } from "@/lib/tools";
import { HoverLink } from "./HoverLink";
import { ToolFilter } from "./ToolFilter";
import { ToolIcon } from "./ToolIcon";

/**
 * Server-rendered tool cards. Only the small filter bar is a client component;
 * it hides cards with CSS (see globals.css), so the cards ship no JavaScript.
 */
export async function ToolGrid() {
  const { t } = await getT();
  return (
    <ToolFilter>
      <div className="tool-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {TOOLS.map((tool) => (
          <HoverLink
            key={tool.slug}
            href={`/${tool.slug}`}
            data-cat={tool.category}
            className="group relative flex min-h-56 flex-col rounded-xl border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-lg"
          >
            {(tool.isNew || tool.unavailable) && (
              <span
                className={`absolute top-4 end-4 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                  tool.unavailable ? "bg-bg text-muted" : "bg-brand/10 text-brand-dark"
                }`}
              >
                {tool.unavailable ? t("Unavailable") : t("New!")}
              </span>
            )}
            <ToolIcon tool={tool} />
            <h2 className="mt-5 text-xl font-semibold text-ink">{t(tool.name)}</h2>
            <p className="mt-2 text-sm leading-5 text-muted">{t(tool.description)}</p>
          </HoverLink>
        ))}
      </div>
    </ToolFilter>
  );
}
