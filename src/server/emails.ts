import "server-only";
import { DEFAULT_LOCALE, isLocale, LOCALE_TAGS, localePath, RTL_LOCALES, type Locale } from "@/i18n/config";
import { tFor } from "@/i18n/request";
import type { T } from "@/i18n/translate";
import { renderEmail, sendEmail } from "./mail";

// Every email Workify sends, in the recipient's language.

const asLocale = (lang: string): Locale => (isLocale(lang) ? lang : DEFAULT_LOCALE);

async function send(
  lang: string,
  to: string,
  build: (t: T, l: Locale) => Omit<Parameters<typeof renderEmail>[0], "to" | "dir">,
) {
  const l = asLocale(lang);
  const t = await tFor(l);
  sendEmail(renderEmail({ ...build(t, l), to, dir: RTL_LOCALES.includes(l) ? "rtl" : "ltr" }));
}

const date = (ms: number, l: Locale) => new Date(ms).toLocaleDateString(LOCALE_TAGS[l], { dateStyle: "long" });

// Account emails can go to an address nobody has verified yet, and the account
// name is free text chosen at signup. So the name is only used when it looks
// like a name (letters, spaces, apostrophes and hyphens, a few short words):
// no links, no sentences. Otherwise the heading has no name in it.
const NAME_RE = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+){0,3}$/u;
export const isPlainName = (name: string) => name.length <= 40 && NAME_RE.test(name) && !/www/i.test(name);
const greet = (t: T, name: string, fallback: string) => (isPlainName(name) ? t("Hi {name},", { name }) : fallback);

// Always sent to an address that is not verified yet, so it never includes the name.
export const sendVerifyEmail = (to: string, _name: string, lang: string, token: string) =>
  send(lang, to, (t, l) => ({
    subject: t("Confirm your email address"),
    heading: t("Confirm your email address"),
    paragraphs: [t("Thanks for creating a Workify account. Please confirm that this is your email address.")],
    button: { label: t("Confirm email"), url: localePath(l, `/verify-email?token=${token}`) },
    footer: t("If you didn't create an account, you can ignore this email."),
  }));

export const sendResetEmail = (to: string, name: string, lang: string, token: string) =>
  send(lang, to, (t, l) => ({
    subject: t("Reset your Workify password"),
    heading: greet(t, name, t("Reset your Workify password")),
    paragraphs: [t("Someone asked to reset the password of your Workify account. Click the button to choose a new password. The link works once and expires in one hour.")],
    button: { label: t("Choose a new password"), url: localePath(l, `/reset-password?token=${token}`) },
    footer: t("If you didn't ask for this, you can ignore this email. Your password stays the same."),
  }));

// Also sent to an unverified address: no name.
export const sendEmailChange = (to: string, _name: string, lang: string, token: string) =>
  send(lang, to, (t, l) => ({
    subject: t("Confirm your new email address"),
    heading: t("Confirm your new email address"),
    paragraphs: [t("Please confirm that you want to use this address for your Workify account.")],
    button: { label: t("Confirm new email"), url: localePath(l, `/verify-email?change=1&token=${token}`) },
    footer: t("If you didn't ask for this, you can ignore this email."),
  }));

export const sendAccountDeleted = (to: string, name: string, lang: string) =>
  send(lang, to, (t) => ({
    subject: t("Your Workify account has been deleted"),
    heading: greet(t, name, t("Your Workify account has been deleted")),
    paragraphs: [t("Your Workify account and its data (workflows, templates, API keys and signature requests) have been deleted.")],
    footer: t("Thank you for using Workify."),
  }));

export const sendPasswordChanged = (to: string, name: string, lang: string) =>
  send(lang, to, (t, l) => ({
    subject: t("Your Workify password was changed"),
    heading: greet(t, name, t("Your Workify password was changed")),
    paragraphs: [t("The password of your Workify account was just changed, and other devices were signed out.")],
    button: { label: t("Reset password"), url: localePath(l, "/forgot-password") },
    footer: t("If this wasn't you, reset your password right away."),
  }));

export const sendSignInvite = (o: {
  to: string;
  lang: string;
  signerName: string;
  senderName: string;
  fileName: string;
  message: string;
  link: string;
  expiresAt: number;
  reminder?: boolean;
}) =>
  send(o.lang, o.to, (t, l) => ({
    subject: o.reminder
      ? t("Reminder: {sender} is waiting for your signature on {file}", { sender: o.senderName, file: o.fileName })
      : t("{sender} sent you {file} to sign", { sender: o.senderName, file: o.fileName }),
    heading: t("Hi {name},", { name: o.signerName }),
    paragraphs: [
      o.reminder
        ? t("This is a reminder that {sender} asked you to sign “{file}”.", { sender: o.senderName, file: o.fileName })
        : t("{sender} asked you to sign “{file}” with Workify.", { sender: o.senderName, file: o.fileName }),
      t("The link is personal and expires on {date}.", { date: date(o.expiresAt, l) }),
    ],
    quote: o.message || undefined,
    button: { label: t("Review and sign"), url: localePath(l, o.link) },
    footer: t("You received this email because someone requested your signature through Workify."),
  }));

export const sendSignProgress = (o: { to: string; lang: string; signerName: string; fileName: string; manageLink: string; remaining: number }) =>
  send(o.lang, o.to, (t, l) => ({
    subject: t("{name} signed {file}", { name: o.signerName, file: o.fileName }),
    heading: t("{name} signed {file}", { name: o.signerName, file: o.fileName }),
    paragraphs: [t("{count} signature(s) still to go.", { count: o.remaining })],
    button: { label: t("View request"), url: localePath(l, o.manageLink) },
    footer: t("You received this email because you requested signatures through Workify."),
  }));

export const sendSignCompleted = (o: { to: string; lang: string; name: string; fileName: string; link: string }) =>
  send(o.lang, o.to, (t, l) => ({
    subject: t("{file} has been signed by everyone", { file: o.fileName }),
    heading: t("Hi {name},", { name: o.name }),
    paragraphs: [
      t("Everyone has signed “{file}”. The final document includes an audit trail and a digital signature that shows if the file is changed later.", { file: o.fileName }),
      t("Download your copy within 30 days."),
    ],
    button: { label: t("Download signed PDF"), url: localePath(l, o.link) },
    footer: t("Sent by Workify."),
  }));

export const sendSignDeclined = (o: { to: string; lang: string; signerName: string; reason: string; fileName: string; manageLink: string }) =>
  send(o.lang, o.to, (t, l) => ({
    subject: t("{name} declined to sign {file}", { name: o.signerName, file: o.fileName }),
    heading: t("{name} declined to sign {file}", { name: o.signerName, file: o.fileName }),
    paragraphs: [t("The signature request has been stopped.")],
    quote: o.reason || undefined,
    button: { label: t("View request"), url: localePath(l, o.manageLink) },
    footer: t("You received this email because you requested signatures through Workify."),
  }));

export const sendSignCancelled = (o: { to: string; lang: string; name: string; senderName: string; fileName: string }) =>
  send(o.lang, o.to, (t) => ({
    subject: t("Signature request cancelled: {file}", { file: o.fileName }),
    heading: t("Hi {name},", { name: o.name }),
    paragraphs: [t("{sender} cancelled the request to sign “{file}”. You don't need to do anything.", { sender: o.senderName, file: o.fileName })],
    footer: t("Sent by Workify."),
  }));

export const sendContactReply = (o: { to: string; lang: string; name: string; subject: string; reply: string; original: string }) =>
  send(o.lang, o.to, (t) => ({
    subject: `Re: ${o.subject}`,
    heading: t("Hi {name},", { name: o.name }),
    paragraphs: o.reply.split(/\n{2,}/),
    quote: o.original,
    footer: t("This is a reply to the message you sent through the Workify contact form."),
  }));

export const sendErrorDigest = (to: string, count: number, latest: string) =>
  send("en", to, () => ({
    subject: `Workify: ${count} new error(s) in the last hour`,
    heading: `${count} new error(s) in the last hour`,
    paragraphs: ["Open the admin panel to see the details."],
    quote: latest,
    button: { label: "Open error log", url: "/admin/errors" },
    footer: "You receive this because you are a Workify admin. At most one digest is sent per hour.",
  }));
