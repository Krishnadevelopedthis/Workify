"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteTemplate } from "@/app/actions/signatures";
import { Icon } from "@/components/Icon";
import { useT } from "@/i18n/client";

export function TemplateList({ templates }: { templates: { id: number; name: string; signers: string[] }[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!templates.length) return <p className="text-sm text-muted">{t("No templates yet. Save one from the signature request form.")}</p>;
  return (
    <ul className="divide-y divide-line">
      {templates.map((tpl) => (
        <li key={tpl.id} className="flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{tpl.name}</p>
            <p className="truncate text-sm text-muted">{tpl.signers.join(", ")}</p>
          </div>
          <button
            className="rounded-lg p-2 text-muted hover:bg-bg hover:text-brand"
            title={t("Delete")}
            disabled={pending}
            onClick={() => {
              if (!confirm(t("Delete the template “{name}”?", { name: tpl.name }))) return;
              start(async () => {
                await deleteTemplate(tpl.id);
                router.refresh();
              });
            }}
          >
            <Icon name="trash" size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}
