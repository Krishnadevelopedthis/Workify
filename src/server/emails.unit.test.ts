import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Email } from "./mail";

const sent: Email[] = [];

vi.mock("./db", () => ({ db: {} }));
vi.mock("./monitor", () => ({ logError: () => {} }));
// The real layout and escaping, but no outbox: emails are collected here.
vi.mock("./mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mail")>()),
  sendEmail: (e: Email) => void sent.push(e),
}));
// tFor without next/headers (no request scope in tests).
vi.mock("@/i18n/request", async () => {
  const { loadMessages, makeT } = await import("@/i18n/translate");
  return { tFor: async (lang: Parameters<typeof loadMessages>[0]) => makeT(await loadMessages(lang)) };
});

const { esc, renderEmail, absoluteUrl } = await import("./mail");
const emails = await import("./emails");
const { SITE_URL } = await import("@/lib/site");

const XSS = `<img src=x onerror="alert('x')">&`;

/** Text nodes and attribute values of the HTML must never contain raw markup from user input. */
function assertNoRawMarkup(html: string) {
  expect(html).not.toContain("<img");
  expect(html).not.toContain("onerror=\"alert");
  expect(html).not.toContain("<script");
}

/** The email that the next send produces. */
async function capture(fn: () => Promise<unknown>) {
  sent.length = 0;
  await fn();
  expect(sent).toHaveLength(1);
  return sent[0];
}

beforeEach(() => {
  sent.length = 0;
});

describe("esc", () => {
  it("escapes the five HTML special characters", () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });

  it("escapes ampersands first, so entities are not double-decoded", () => {
    expect(esc("&lt;")).toBe("&amp;lt;");
  });

  it("leaves other text and unicode alone", () => {
    expect(esc("")).toBe("");
    expect(esc("नमस्ते “quotes” 😀")).toBe("नमस्ते “quotes” 😀");
  });
});

describe("absoluteUrl", () => {
  it("prefixes site paths and keeps absolute links", () => {
    expect(absoluteUrl("/sign/abc")).toBe(`${SITE_URL}/sign/abc`);
    expect(absoluteUrl("https://example.com/x")).toBe("https://example.com/x");
  });
});

describe("renderEmail", () => {
  const base = {
    to: "a@example.com",
    subject: "S",
    heading: XSS,
    paragraphs: [XSS, "second"],
    quote: `${XSS}\nline two`,
    button: { label: XSS, url: `/x?a=1&b="2"` },
    footer: XSS,
  };

  it("escapes every user-controlled part of the HTML", () => {
    const { html } = renderEmail(base);
    assertNoRawMarkup(html);
    expect(html).toContain(esc(XSS));
    // The button URL is escaped inside the href attribute too.
    expect(html).toContain(`href="${esc(`${SITE_URL}/x?a=1&b="2"`)}"`);
  });

  it("keeps the plain-text part readable (unescaped)", () => {
    const { text } = renderEmail(base);
    expect(text.split("\n")[0]).toBe(XSS);
    expect(text).toContain(`${XSS}: ${SITE_URL}/x?a=1&b="2"`);
    expect(text).toContain("line two");
  });

  it("omits the quote and button blocks when not given", () => {
    const { html, text } = renderEmail({ to: "a@b.co", subject: "S", heading: "H", paragraphs: [], footer: "F" });
    expect(html).not.toContain("border-inline-start");
    expect(html).not.toContain("<a href");
    // Empty paragraphs leave one extra blank line between heading and footer.
    expect(text).toBe("H\n\n\nF");
  });

  it("sets the text direction", () => {
    expect(renderEmail({ ...base, dir: "rtl" }).html).toContain('<html dir="rtl">');
    expect(renderEmail(base).html).toContain('<html dir="ltr">');
  });
});

describe("emails", () => {
  it("escapes file and sender names in signature invitations but keeps the subject as plain text", async () => {
    const e = await capture(() =>
      emails.sendSignInvite({
        to: "s@example.com",
        lang: "en",
        signerName: XSS,
        senderName: XSS,
        fileName: `${XSS}.pdf`,
        message: XSS,
        link: "/sign/tok123",
        expiresAt: Date.UTC(2026, 0, 15, 12),
      }),
    );
    assertNoRawMarkup(e.html);
    expect(e.subject).toBe(`${XSS} sent you ${XSS}.pdf to sign`);
    expect(e.html).toContain(`${SITE_URL}/sign/tok123`);
    expect(e.text).toContain("January 15, 2026");
  });

  it("does not interpret $ patterns in names", async () => {
    const e = await capture(() =>
      emails.sendSignCompleted({ to: "s@example.com", lang: "en", name: "$&$1", fileName: "$'x.pdf", link: "/d/1" }),
    );
    expect(e.subject).toBe("$'x.pdf has been signed by everyone");
    expect(e.text).toContain("Hi $&$1,");
  });

  it("uses reminder wording for reminders", async () => {
    const e = await capture(() =>
      emails.sendSignInvite({
        to: "s@example.com",
        lang: "en",
        signerName: "S",
        senderName: "Asha",
        fileName: "c.pdf",
        message: "",
        link: "/sign/t",
        expiresAt: Date.now(),
        reminder: true,
      }),
    );
    expect(e.subject).toBe("Reminder: Asha is waiting for your signature on c.pdf");
    // An empty message adds no quote block.
    expect(e.html).not.toContain("border-inline-start");
  });

  it("writes to Arabic readers right-to-left and links to the Arabic page", async () => {
    const e = await capture(() => emails.sendVerifyEmail("a@example.com", "Ali", "ar", "TOKEN_abc-123"));
    expect(e.html).toContain('<html dir="rtl">');
    expect(e.text).toContain(`${SITE_URL}/ar/verify-email?token=TOKEN_abc-123`);
  });

  it("falls back to English for unknown languages", async () => {
    for (const lang of ["xx", "", "__proto__", "EN"]) {
      const e = await capture(() => emails.sendResetEmail("a@example.com", "A", lang, "t"));
      expect(e.subject).toBe("Reset your Workify password");
      expect(e.text).toContain(`${SITE_URL}/reset-password?token=t`);
      expect(e.html).toContain('<html dir="ltr">');
    }
  });

  it("translates the subject when a translation exists", async () => {
    const en = await capture(() => emails.sendPasswordChanged("a@example.com", "A", "en"));
    const hi = await capture(() => emails.sendPasswordChanged("a@example.com", "A", "hi"));
    expect(hi.subject).not.toBe(en.subject);
    expect(hi.text).toContain(`${SITE_URL}/hi/forgot-password`);
  });

  it("sends email-change confirmations to the change link", async () => {
    const e = await capture(() => emails.sendEmailChange("new@example.com", "A", "en", "tk"));
    expect(e.to).toBe("new@example.com");
    expect(e.text).toContain("/verify-email?change=1&token=tk");
  });

  it("splits contact replies into paragraphs and quotes the original, escaped", async () => {
    const e = await capture(() =>
      emails.sendContactReply({ to: "c@example.com", lang: "en", name: "C", subject: "Help", reply: "One\n\n\nTwo", original: XSS }),
    );
    expect(e.subject).toBe("Re: Help");
    assertNoRawMarkup(e.html);
    expect(e.text).toContain("One\nTwo");
  });

  it("escapes the latest error in the admin digest", async () => {
    const e = await capture(() => emails.sendErrorDigest("admin@example.com", 3, `<script>alert(1)</script>`));
    assertNoRawMarkup(e.html);
    expect(e.subject).toBe("Workify: 3 new error(s) in the last hour");
  });

  describe("names in account emails", () => {
    const PHISH = "Security alert: your files will be deleted, restore at evil.example/restore";
    const firstLine = (e: Email) => e.text.split("\n")[0];

    it("never puts the name in emails to unverified addresses", async () => {
      for (const fn of [
        () => emails.sendVerifyEmail("victim@example.com", PHISH, "en", "tk"),
        () => emails.sendEmailChange("victim@example.com", PHISH, "en", "tk"),
        () => emails.sendVerifyEmail("victim@example.com", "Asha", "en", "tk"),
      ]) {
        const e = await capture(fn);
        expect(e.text).not.toContain("evil");
        expect(e.text).not.toContain("Asha");
        expect(firstLine(e)).toBe(e.subject);
      }
    });

    it("greets plain names and drops link-like or long ones", async () => {
      for (const fn of [emails.sendPasswordChanged, emails.sendAccountDeleted]) {
        expect(firstLine(await capture(() => fn("a@example.com", "José O’Neil-Smith", "en")))).toBe("Hi José O’Neil-Smith,");
        expect((await capture(() => fn("a@example.com", "नमस्ते राज", "hi"))).text).toContain("नमस्ते राज");
        for (const bad of [PHISH, "evil.example", "www evil com", "go to bit ly now please", "a/b", "x:y", XSS]) {
          const e = await capture(() => fn("a@example.com", bad, "en"));
          expect(firstLine(e)).toBe(e.subject);
        }
      }
      const r = await capture(() => emails.sendResetEmail("a@example.com", PHISH, "en", "t"));
      expect(r.text).not.toContain("evil");
    });

    it("recognises plain names", () => {
      expect(emails.isPlainName("Ali")).toBe(true);
      expect(emails.isPlainName("Mary Ann de la Cruz")).toBe(false); // five words
      expect(emails.isPlainName("Mary-Ann Cruz")).toBe(true);
      expect(emails.isPlainName("李小龙")).toBe(true);
      expect(emails.isPlainName("evil.example")).toBe(false);
      expect(emails.isPlainName("Wwwalter")).toBe(false);
      expect(emails.isPlainName("a".repeat(41))).toBe(false);
    });
  });

  it.each([
    ["sendAccountDeleted", () => emails.sendAccountDeleted("a@example.com", XSS, "en")],
    ["sendSignProgress", () => emails.sendSignProgress({ to: "a@example.com", lang: "en", signerName: XSS, fileName: XSS, manageLink: "/m", remaining: 0 })],
    ["sendSignDeclined", () => emails.sendSignDeclined({ to: "a@example.com", lang: "en", signerName: XSS, reason: XSS, fileName: XSS, manageLink: "/m" })],
    ["sendSignCancelled", () => emails.sendSignCancelled({ to: "a@example.com", lang: "en", name: XSS, senderName: XSS, fileName: XSS })],
  ])("%s escapes user text", async (_name, fn) => {
    assertNoRawMarkup((await capture(fn)).html);
  });
});
