import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

export function AdminTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-white p-5 ${className}`}>{children}</div>;
}

export function Stat({ icon, label, value, tone }: { icon: string; label: string; value: ReactNode; tone?: "warn" | "bad" }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone === "bad" ? "bg-brand/10 text-brand" : tone === "warn" ? "bg-[#f1b800]/15 text-[#a07a00]" : "bg-bg text-ink"}`}>
          <Icon name={icon} size={20} />
        </span>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      </div>
    </Card>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="bg-bg text-start text-xs text-muted uppercase">
          <tr>{head.map((h) => <th key={h} className="p-3 text-start font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <p className="p-6 text-center text-sm text-muted">{empty}</p>}
    </div>
  );
}

export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <td className={`border-t border-line p-3 align-top ${className}`}>{children}</td>
);

export const fmtDate = (ms: number | null | undefined, tag: string) =>
  ms ? new Date(ms).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" }) : "—";

export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;
