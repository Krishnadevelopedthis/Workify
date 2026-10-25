import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A real outbox table in memory and a fake SMTP transport.
const memory = new DatabaseSync(":memory:");
memory.exec(`CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT NOT NULL, subject TEXT NOT NULL, html TEXT NOT NULL, text TEXT NOT NULL,
  status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT, created_at INTEGER NOT NULL, sent_at INTEGER)`);
vi.mock("./db", () => ({ db: memory }));
vi.mock("./monitor", () => ({ logError: () => {} }));

const mail = await import("./mail");
const { SITE_URL } = await import("@/lib/site");

type Row = { id: number; to_email: string; subject: string; html: string; text: string; status: string; created_at: number };
const g = globalThis as unknown as { workifyMailer?: unknown };
const delivered: { html: string; text: string }[] = [];
let failSend = false;
const fakeMailer = {
  sendMail: async (m: { html: string; text: string }) => {
    if (failSend) throw new Error("SMTP down");
    delivered.push(m);
  },
};

const TOKEN = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
const signEmail = () =>
  mail.renderEmail({
    to: "signer@example.com",
    subject: "Please sign",
    heading: "Hi",
    paragraphs: ["Sign this."],
    button: { label: "Review and sign", url: `/sign/${TOKEN}` },
    footer: "Footer",
  });
const resetEmail = () =>
  mail.renderEmail({
    to: "user@example.com",
    subject: "Reset",
    heading: "Reset",
    paragraphs: ["Reset it."],
    button: { label: "Choose a new password", url: `/reset-password?token=${TOKEN}` },
    footer: "Footer",
  });

const rows = () => memory.prepare("SELECT * FROM outbox ORDER BY id").all() as Row[];
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  memory.exec("DELETE FROM outbox");
  delivered.length = 0;
  failSend = false;
  g.workifyMailer = fakeMailer;
});

describe("outbox redaction (WEB2-02)", () => {
  it("removes token links from the stored copy once the email is sent", async () => {
    mail.sendEmail(signEmail());
    mail.sendEmail(resetEmail());
    await flush();
    expect(delivered).toHaveLength(2);
    // The recipient got the real links.
    expect(delivered[0].text).toContain(`${SITE_URL}/sign/${TOKEN}`);
    expect(delivered[1].html).toContain(TOKEN);
    for (const r of rows()) {
      expect(r.status).toBe("sent");
      expect(r.html).not.toContain(TOKEN);
      expect(r.text).not.toContain(TOKEN);
      expect(r.text).toContain(mail.REDACTED_LINK);
    }
    expect(rows().map((r) => [r.to_email, r.subject])).toEqual([
      ["signer@example.com", "Please sign"],
      ["user@example.com", "Reset"],
    ]);
  });

  it("keeps the full body while the email is queued or failed, so it can be retried", async () => {
    failSend = true;
    mail.sendEmail(signEmail());
    await flush();
    const [r] = rows();
    expect(r.status).toBe("queued");
    expect(r.text).toContain(TOKEN);
    mail.redactOutbox();
    expect(rows()[0].text).toContain(TOKEN);
  });

  it("keeps logged emails (no SMTP) readable for at most an hour", () => {
    g.workifyMailer = null;
    mail.sendEmail(signEmail());
    expect(rows()[0].status).toBe("logged");
    mail.redactOutbox();
    expect(rows()[0].text).toContain(TOKEN);

    memory.prepare("UPDATE outbox SET created_at = ?").run(Date.now() - 3_600_000);
    mail.redactOutbox();
    const [r] = rows();
    expect(r.status).toBe("logged");
    expect(r.text).not.toContain(TOKEN);
    expect(r.html).not.toContain(TOKEN);
    expect(r.subject).toBe("Please sign");
  });

  it("redacts sent rows stored before the fix", () => {
    const e = signEmail();
    memory
      .prepare("INSERT INTO outbox (to_email, subject, html, text, status, created_at, sent_at) VALUES (?, ?, ?, ?, 'sent', ?, ?)")
      .run(e.to, e.subject, e.html, e.text, Date.now(), Date.now());
    mail.redactOutbox();
    expect(rows()[0].text).not.toContain(TOKEN);
    expect(rows()[0].html).not.toContain(TOKEN);
  });

  it("does not send a redacted email again", async () => {
    g.workifyMailer = null;
    mail.sendEmail(signEmail());
    memory.prepare("UPDATE outbox SET created_at = ?").run(Date.now() - 3_600_000);
    mail.redactOutbox();
    g.workifyMailer = fakeMailer;
    const [r] = rows();
    memory.prepare("UPDATE outbox SET status = 'queued' WHERE id = ?").run(r.id);
    await mail.deliver(r.id);
    expect(delivered).toHaveLength(0);
    expect(rows()[0].status).toBe("failed");
  });
});

describe("outboxPreview (WEB2-02)", () => {
  it("hides links of sent and old logged emails from the admin panel", () => {
    const text = `Sign: ${SITE_URL}/sign/${TOKEN}`;
    const now = Date.now();
    expect(mail.outboxPreview({ text, status: "queued", created_at: now })).toContain(TOKEN);
    expect(mail.outboxPreview({ text, status: "failed", created_at: now - 86_400_000 })).toContain(TOKEN);
    expect(mail.outboxPreview({ text, status: "logged", created_at: now })).toContain(TOKEN);
    expect(mail.outboxPreview({ text, status: "logged", created_at: now - 3_600_000 })).not.toContain(TOKEN);
    expect(mail.outboxPreview({ text, status: "sent", created_at: now })).not.toContain(TOKEN);
  });
});

describe("isRedacted", () => {
  it("is not fooled by a message that quotes the placeholder", () => {
    expect(mail.isRedacted({ text: `Note: ${mail.REDACTED_LINK}\nSign: ${SITE_URL}/sign/${TOKEN}` })).toBe(false);
    expect(mail.isRedacted({ text: `Sign: ${mail.REDACTED_LINK}` })).toBe(true);
  });
});
