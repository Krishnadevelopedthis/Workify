import { Icon } from "@/components/Icon";
import { LOCALE_TAGS, type Locale } from "@/i18n/config";
import type { T } from "@/i18n/translate";
import { eventsOf, isExpired, linkOf, signersOf, type SignRequest } from "@/server/sign-requests";
import { RequestActions } from "./RequestActions";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-[#f1b800]/15 text-[#a07a00]",
  completed: "bg-[#6aa84f]/15 text-[#4a8a32]",
  declined: "bg-brand/10 text-brand",
  cancelled: "bg-bg text-muted",
  expired: "bg-bg text-muted",
};

export const requestStatus = (r: SignRequest) => (isExpired(r) ? "expired" : r.status);

export const STATUS_LABEL: Record<string, string> = {
  pending: "In progress",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

const SIGNER_LABEL: Record<string, string> = {
  waiting: "Waiting for their turn",
  ready: "Invited",
  viewed: "Opened",
  signed: "Signed",
  declined: "Declined",
};

const EVENT_LABEL: Record<string, string> = {
  created: "Request created",
  sent: "Invitation emailed",
  viewed: "Document opened",
  signed: "Signed",
  declined: "Declined",
  reminded: "Reminder sent",
  completed: "Completed and sealed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status, t }: { status: string; t: T }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{t(STATUS_LABEL[status])}</span>;
}

/**
 * Everything the owner sees about one request. `access` decides how actions
 * and downloads are authorized: the signed-in owner (by id) or the private
 * management link (by token).
 */
export function RequestDetail({
  request,
  access,
  t,
  lang,
}: {
  request: SignRequest;
  access: { kind: "account"; id: string } | { kind: "manage"; token: string };
  t: T;
  lang: Locale;
}) {
  const signers = signersOf(request.id);
  const events = eventsOf(request.id);
  const names = new Map(signers.map((s) => [s.id, s.name]));
  const status = requestStatus(request);
  const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(LOCALE_TAGS[lang], { dateStyle: "medium", timeStyle: "short" }) : "");
  const fileUrl =
    access.kind === "account" ? `/api/sign-requests/${access.id}/file` : `/api/sign-manage/${access.token}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-line bg-white p-6">
        <Icon name="file-type-pdf" size={40} className="text-brand" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold">{request.file_name}</h2>
          <p className="mt-1 text-sm text-muted">
            {t("Sent {date}", { date: when(request.created_at) })} ·{" "}
            {request.ordered ? t("Signers sign in order") : t("Signers sign in any order")}
            {request.reminder_days > 0 && ` · ${t("Reminder every {days} day(s)", { days: request.reminder_days })}`}
          </p>
          <p className="mt-2"><StatusBadge status={status} t={t} /></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "completed" ? (
            <a href={`${fileUrl}?which=final`} className="btn-primary !py-2">
              <Icon name="download" size={18} /> {t("Download signed PDF")}
            </a>
          ) : (
            <a href={`${fileUrl}?which=current`} className="btn-secondary !py-2">
              <Icon name="download" size={18} /> {t("Download current copy")}
            </a>
          )}
          {status === "pending" && <RequestActions access={access} />}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-6">
        <h3 className="mb-3 font-bold">{t("Signers")}</h3>
        <ul className="divide-y divide-line">
          {signers.map((s) => {
            const link = status === "pending" && s.status !== "signed" ? linkOf(s) : null;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-sm font-bold">{s.position + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-muted">{s.email ?? t("No email: share the link yourself")}</p>
                  {s.decline_reason && <p className="mt-1 text-sm text-brand">“{s.decline_reason}”</p>}
                </div>
                <div className="text-end text-sm">
                  <p className={s.status === "signed" ? "font-semibold text-[#4a8a32]" : s.status === "declined" ? "font-semibold text-brand" : "text-muted"}>
                    {t(SIGNER_LABEL[s.status])}
                  </p>
                  <p className="text-xs text-muted">{when(s.signed_at ?? s.viewed_at ?? s.notified_at)}</p>
                </div>
                {link && <RequestActions access={access} copyLink={link} />}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-line bg-white p-6">
        <h3 className="mb-3 flex items-center gap-2 font-bold"><Icon name="history" size={20} /> {t("Audit trail")}</h3>
        <ol className="space-y-2 border-s-2 border-line ps-4 text-sm">
          {events.map((e) => (
            <li key={e.id}>
              <span className="font-medium">{t(EVENT_LABEL[e.event] ?? e.event)}</span>
              {e.signer_id && <span> · {names.get(e.signer_id)}</span>}
              <span className="text-muted"> · {when(e.at)}{e.ip ? ` · IP ${e.ip}` : ""}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted">
          {t("When everyone has signed, this trail is added to the PDF as a signature certificate, and the file is sealed with a digital signature.")}
        </p>
      </div>
    </div>
  );
}
