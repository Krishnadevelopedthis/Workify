import { deleteUser, setUserDisabled, setUserRole, verifyUser } from "@/app/actions/admin";
import { LOCALE_TAGS } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/server/admin";
import { isAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { ActionButton } from "../ActionButton";
import { AdminTitle, fmtDate, Table, Td } from "../ui";

type Row = {
  id: number;
  name: string;
  email: string;
  role: string;
  email_verified_at: number | null;
  disabled_at: number | null;
  created_at: number;
  last_seen: number | null;
  workflows: number;
  requests: number;
};

export default async function AdminUsers({ searchParams }: PageProps<"/[lang]/admin/users">) {
  const me = await requireAdmin();
  const { t, lang } = await getT();
  const q = String((await searchParams).q ?? "").trim().slice(0, 100);
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.email_verified_at, u.disabled_at, u.created_at,
         (SELECT MAX(expires_at) - 30 * 86400000 FROM sessions s WHERE s.user_id = u.id) AS last_seen,
         (SELECT COUNT(*) FROM workflows w WHERE w.user_id = u.id) AS workflows,
         (SELECT COUNT(*) FROM sign_requests r WHERE r.owner_id = u.id) AS requests
       FROM users u WHERE u.email LIKE ? OR u.name LIKE ? ORDER BY u.created_at DESC LIMIT 200`,
    )
    .all(`%${q}%`, `%${q}%`) as Row[];
  const tag = LOCALE_TAGS[lang];

  return (
    <div>
      <AdminTitle
        title={t("Users")}
        subtitle={t("Showing up to 200 users, newest first.")}
        action={
          <form className="flex gap-2">
            <input className="input !py-1.5 text-sm" name="q" defaultValue={q} placeholder={t("Search name or email")} />
            <button className="btn-secondary !py-1.5 text-sm">{t("Search")}</button>
          </form>
        }
      />
      <Table head={[t("User"), t("Status"), t("Joined"), t("Last login"), t("Data"), t("Actions")]} empty={rows.length ? undefined : t("No users found.")}>
        {rows.map((u) => {
          const admin = isAdmin(u);
          return (
            <tr key={u.id}>
              <Td>
                <p className="font-semibold">{u.name}</p>
                <p className="text-xs text-muted">{u.email}</p>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {admin && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">{t("Admin")}</span>}
                  {u.email_verified_at ? (
                    <span className="rounded-full bg-[#6aa84f]/15 px-2 py-0.5 text-[10px] font-bold text-[#4a8a32]">{t("Verified")}</span>
                  ) : (
                    <span className="rounded-full bg-[#f1b800]/15 px-2 py-0.5 text-[10px] font-bold text-[#a07a00]">{t("Not verified")}</span>
                  )}
                  {u.disabled_at && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-white">{t("Suspended")}</span>}
                </div>
              </Td>
              <Td>{fmtDate(u.created_at, tag)}</Td>
              <Td>{fmtDate(u.last_seen, tag)}</Td>
              <Td className="text-xs text-muted">{t("{w} workflows · {r} requests", { w: u.workflows, r: u.requests })}</Td>
              <Td>
                {u.id === me.id ? (
                  <span className="text-xs text-muted">{t("You")}</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {!u.email_verified_at && <ActionButton action={verifyUser.bind(null, u.id)}>{t("Mark verified")}</ActionButton>}
                    {u.role === "admin" ? (
                      <ActionButton action={setUserRole.bind(null, u.id, "user")}>{t("Remove admin")}</ActionButton>
                    ) : (
                      <ActionButton action={setUserRole.bind(null, u.id, "admin")} confirmText="Give this user full admin access?">{t("Make admin")}</ActionButton>
                    )}
                    <ActionButton action={setUserDisabled.bind(null, u.id, !u.disabled_at)}>
                      {u.disabled_at ? t("Unsuspend") : t("Suspend")}
                    </ActionButton>
                    <ActionButton action={deleteUser.bind(null, u.id)} confirmText="Delete this user and all their data? This cannot be undone." danger>
                      {t("Delete")}
                    </ActionButton>
                  </div>
                )}
              </Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
