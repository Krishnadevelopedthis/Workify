import { Icon } from "@/components/Icon";
import { getT } from "@/i18n/server";
import { SITE_URL } from "@/lib/site";
import { requireAdmin } from "@/server/admin";
import { engines } from "@/server/engines";
import { smtpConfigured } from "@/server/mail";
import { certificateInfo } from "@/server/pdf-sign";
import { AdminTitle, Card } from "../ui";
import { SmtpTest } from "./SmtpTest";

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      <Icon name={ok ? "circle-check" : "alert-circle"} size={18} className={`mt-0.5 shrink-0 ${ok ? "text-[#4a8a32]" : "text-brand"}`} />
      <span>
        <span className="font-medium">{label}</span>
        {detail && <span className="block break-all font-mono text-xs text-muted">{detail}</span>}
      </span>
    </li>
  );
}

export default async function AdminSystem() {
  const me = await requireAdmin();
  const { t } = await getT();
  let cert: Awaited<ReturnType<typeof certificateInfo>> | null = null;
  try {
    cert = await certificateInfo();
  } catch {
    cert = null;
  }
  const env = process.env;
  return (
    <div className="space-y-6">
      <AdminTitle title={t("System")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">{t("PDF engines")}</h2>
          <ul className="text-sm">
            <Check ok={Boolean(engines.ghostscript)} label="Ghostscript" detail={engines.ghostscript} />
            <Check ok={Boolean(engines.qpdf)} label="qpdf" detail={engines.qpdf} />
            <Check ok={Boolean(engines.soffice)} label="LibreOffice" detail={engines.soffice} />
            <Check ok={Boolean(engines.tesseractDir)} label="Tesseract" detail={engines.tessdata} />
            <Check ok={Boolean(engines.python)} label="Python" detail={engines.python} />
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">{t("Email (SMTP)")}</h2>
          <ul className="text-sm">
            <Check ok={smtpConfigured()} label={smtpConfigured() ? t("Configured") : t("Not configured")} detail={env.SMTP_HOST ? `${env.SMTP_HOST}:${env.SMTP_PORT ?? 587} · ${env.MAIL_FROM ?? ""}` : "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM"} />
          </ul>
          <SmtpTest defaultTo={me.email} />
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">{t("Configuration")}</h2>
          <ul className="text-sm">
            <Check ok={!SITE_URL.includes("localhost")} label={t("Public site URL")} detail={SITE_URL} />
            <Check ok={Boolean(env.WORKIFY_SECRET)} label="WORKIFY_SECRET" detail={env.WORKIFY_SECRET ? t("set") : t("not set: using data/secret.key (keep it with your backups)")} />
            <Check ok label="WORKIFY_ADMIN_EMAILS" detail={env.WORKIFY_ADMIN_EMAILS || t("not set (admins come from the user list)")} />
            <Check ok label="WORKIFY_TRUST_PROXY" detail={env.WORKIFY_TRUST_PROXY ?? "1"} />
            <Check ok label="WORKIFY_MAX_JOBS / WORKIFY_MAX_QUEUE" detail={`${env.WORKIFY_MAX_JOBS ?? 4} / ${env.WORKIFY_MAX_QUEUE ?? 20}`} />
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">{t("Signing certificate")}</h2>
          {cert ? (
            <ul className="text-sm">
              <Check ok label={cert.subject} detail={`SHA-256 ${cert.fingerprint}`} />
              <Check
                ok={!cert.selfSigned}
                label={cert.selfSigned ? t("Self-signed by Workify") : t("Issued by a certificate authority")}
                detail={cert.selfSigned ? t("Set WORKIFY_SIGN_P12 and WORKIFY_SIGN_P12_PASSWORD to use a certificate that PDF readers trust.") : null}
              />
            </ul>
          ) : (
            <p className="text-sm text-brand">{t("The signing certificate could not be loaded.")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
