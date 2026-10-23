import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { LOCALE_TAGS } from "@/i18n/config";
import { Link } from "@/i18n/Link";
import { getT } from "@/i18n/server";
import { canSign, isExpired, signerByToken, signersOf } from "@/server/sign-requests";
import { SignRequestClient } from "./SignRequestClient";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Sign document"), robots: { index: false } };
}

function Message({ icon, tone, title, text, children }: { icon: string; tone: "ok" | "info" | "error"; title: string; text?: string; children?: React.ReactNode }) {
  const color = tone === "ok" ? "bg-[#6aa84f] text-white" : tone === "error" ? "bg-brand/10 text-brand" : "bg-bg text-ink";
  return (
    <section className="flex flex-1 flex-col items-center px-4 py-24 text-center">
      <span className={`flex h-16 w-16 items-center justify-center rounded-full ${color}`}>
        <Icon name={icon} size={36} />
      </span>
      <h1 className="mt-4 max-w-2xl text-3xl font-bold">{title}</h1>
      {text && <p className="mt-2 max-w-xl text-muted">{text}</p>}
      {children}
    </section>
  );
}

/** A signer's personal page. */
export default async function SignPage({ params }: PageProps<"/[lang]/sign/[token]">) {
  const { token } = await params;
  const { t, lang } = await getT();
  const found = signerByToken(token);
  const date = (ms: number) => new Date(ms).toLocaleString(LOCALE_TAGS[lang], { dateStyle: "long", timeStyle: "short" });

  if (!found || (isExpired(found.request) && found.request.status === "pending")) {
    return (
      <Message icon="alert-triangle" tone="error" title={t("This signing link is not valid")} text={t("It may have expired (links last 30 days) or been typed incorrectly.")}>
        <Link href="/sign-pdf" className="btn-primary mt-8">{t("Sign a PDF yourself")}</Link>
      </Message>
    );
  }
  const { request, signer } = found;

  if (request.status === "completed") {
    return (
      <Message icon="check" tone="ok" title={t("“{file}” has been signed by everyone", { file: request.file_name })} text={t("Completed on {date}. The PDF includes a signature certificate and a digital seal.", { date: date(request.completed_at!) })}>
        <a href={`/api/sign/${token}/file?final=1`} className="btn-primary mt-8 !px-10 !py-4 text-lg">
          <Icon name="download" size={22} /> {t("Download signed PDF")}
        </a>
      </Message>
    );
  }
  if (request.status === "cancelled") {
    return <Message icon="x" tone="info" title={t("This request was cancelled")} text={t("{sender} cancelled the request. You don't need to do anything.", { sender: request.sender_name })} />;
  }
  if (request.status === "declined") {
    return <Message icon="x" tone="info" title={t("This request was declined")} text={t("A signer declined, so the request has been stopped.")} />;
  }
  if (signer.status === "signed") {
    return <Message icon="check" tone="ok" title={t("Thank you, you have signed")} text={t("You'll get an email with the final document when everyone has signed.")} />;
  }
  if (!canSign(request, signer)) {
    const before = signersOf(request.id).filter((s) => s.position < signer.position && s.status !== "signed");
    return (
      <Message
        icon="clock"
        tone="info"
        title={t("It's not your turn yet")}
        text={t("This document is signed in order. You'll get an email when {names} has signed.", { names: before.map((s) => s.name).join(", ") })}
      />
    );
  }

  return (
    <SignRequestClient
      token={token}
      fileName={request.file_name}
      signerName={signer.name}
      senderName={request.sender_name}
      message={request.message}
    />
  );
}
