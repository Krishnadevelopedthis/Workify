import icons from "@/lib/icons.json";

// Iconify (Tabler set) icons rendered as plain SVG: no hooks and no client-side
// runtime, so icons cost nothing to hydrate and also work in server components.
type IconData = { body: string; width?: number; height?: number };
const set = icons as unknown as {
  icons: Record<string, IconData>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
};

function lookup(name: string): IconData | undefined {
  return set.icons[name] ?? (set.aliases?.[name] ? set.icons[set.aliases[name].parent] : undefined);
}

export function Icon({ name, className, size = "1em" }: { name: string; className?: string; size?: number | string }) {
  const data = lookup(name);
  const w = data?.width ?? set.width ?? 24;
  const h = data?.height ?? set.height ?? 24;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      // Icon bodies come from the bundled, trusted Tabler set — never from user input.
      dangerouslySetInnerHTML={{ __html: data?.body ?? "" }}
    />
  );
}
