import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listWorkflows } from "@/app/actions/workflows";
import { Icon } from "@/components/Icon";
import { TOOL_BY_SLUG } from "@/lib/tools";
import { currentUser } from "@/server/auth";
import { db } from "@/server/db";
import { requestsForUser } from "@/server/sign-requests";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  const since = (db.prepare("SELECT created_at FROM users WHERE id = ?").get(user.id) as { created_at: number }).created_at;
  const workflows = (await listWorkflows()) ?? [];
  const requests = requestsForUser(user.id);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold">My account</h1>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-2xl border border-line bg-white p-6">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <p className="mt-3 text-lg font-bold">{user.name}</p>
            <p className="text-sm text-muted">{user.email}</p>
            <p className="mt-3 text-xs text-muted">Member since {new Date(since).toLocaleDateString()}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              <Icon name="crown" size={14} /> Premium features: free for everyone
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-white p-6">
            <h2 className="mb-3 font-bold">Password</h2>
            <PasswordForm />
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-line bg-white p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">My workflows</h2>
              <Link href="/create-workflow" className="text-sm font-semibold text-brand">+ New workflow</Link>
            </div>
            {workflows.length === 0 ? (
              <p className="text-sm text-muted">You haven&apos;t saved any workflows yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {workflows.map((w) => (
                  <li key={w.id} className="py-3">
                    <p className="font-semibold">{w.name}</p>
                    <p className="text-sm text-muted">{w.steps.map((s) => TOOL_BY_SLUG.get(s.tool)?.name).join(" → ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-white p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Signature requests</h2>
              <Link href="/sign-pdf" className="text-sm font-semibold text-brand">+ New request</Link>
            </div>
            {requests.length === 0 ? (
              <p className="text-sm text-muted">Requests you send from Sign PDF → “Several people” show up here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.file_name}</p>
                      <p className="text-sm text-muted">For {r.signer_name} · {new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "signed" ? "bg-[#6aa84f]/15 text-[#4a8a32]" : "bg-[#f1b800]/15 text-[#a07a00]"}`}>
                      {r.status === "signed" ? "Signed" : "Waiting"}
                    </span>
                    <Link href={`/sign/${r.id}`} className="text-sm font-semibold text-brand">Open</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
