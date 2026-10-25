// Multi-signer signing, end to end over HTTP, with anonymous signers
// (no emails: the sender shares the personal links themselves).
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { baseHeaders, expectJsonError, expectNoLeak, makePdf, makePng, pageCount, PDF_TYPE, url } from "./helpers";

type Created = {
  id: string;
  manageLink: string;
  accountLink: string | null;
  signers: { name: string; email: string | null; link: string }[];
};

let doc2: Uint8Array;

beforeAll(async () => {
  doc2 = await makePdf(2, "Contract to sign");
});

async function createRequest(fields: Record<string, string>, file: Uint8Array | null = doc2, name = "contract.pdf", headers: Record<string, string> = {}) {
  const fd = new FormData();
  if (file) fd.append("file", new Blob([file as BlobPart], { type: PDF_TYPE }), name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(url("/api/sign-requests"), { method: "POST", headers: baseHeaders(headers), body: fd });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { res, body, text };
}

async function createOk(signers: { name: string; email?: string }[], extra: Record<string, string> = {}) {
  const { res, body, text } = await createRequest({ signers: JSON.stringify(signers), senderName: "Integration Tester", ...extra });
  expect(res.status, text).toBe(200);
  return body as Created;
}

const tokenOf = (link: string) => link.split("/").pop()!;

function signForm(name: string, withImage = true) {
  const fd = new FormData();
  fd.append("action", "sign");
  const overlays: unknown[] = [{ kind: "text", page: 1, x: 60, y: 120, text: name, size: 14, color: "#000000", font: "Helvetica" }];
  if (withImage) {
    overlays.push({ kind: "image", page: 2, x: 300, y: 100, w: 120, h: 40, image: "signature" });
    fd.append("extra:signature", new Blob([makePng(120, 40, [0, 0, 0]) as BlobPart], { type: "image/png" }), "sig.png");
  }
  fd.append("overlays", JSON.stringify(overlays));
  return fd;
}

async function sign(token: string, fd: FormData) {
  const res = await fetch(url(`/api/sign/${token}`), { method: "POST", headers: baseHeaders(), body: fd });
  const text = await res.text();
  return { res, text, body: (() => { try { return JSON.parse(text); } catch { return text; } })() };
}

describe("multi-signer request, in signing order", () => {
  let created: Created;
  let alice: string;
  let bob: string;
  let manage: string;

  it("creates a request with two anonymous signers", async () => {
    created = await createOk([{ name: "Alice" }, { name: "Bob" }], { ordered: "true", message: "Please sign", reminderDays: "3" });
    expect(created.id).toBeTruthy();
    expect(created.accountLink).toBeNull();
    expect(created.manageLink).toMatch(/^\/sign\/manage\/[A-Za-z0-9_-]{43}$/);
    expect(created.signers.map((s) => s.name)).toEqual(["Alice", "Bob"]);
    for (const s of created.signers) {
      expect(s.email).toBeNull();
      expect(s.link).toMatch(/^\/sign\/[A-Za-z0-9_-]{43}$/);
    }
    alice = tokenOf(created.signers[0].link);
    bob = tokenOf(created.signers[1].link);
    manage = tokenOf(created.manageLink);
    expect(new Set([alice, bob, manage]).size).toBe(3);
  });

  it("serves the signing pages and the document to sign", async () => {
    for (const link of [created.signers[0].link, created.manageLink]) {
      const page = await fetch(url(link), { headers: baseHeaders() });
      expect(page.status, link).toBe(200);
      expect(page.headers.get("content-type")).toMatch(/text\/html/);
    }
    const file = await fetch(url(`/api/sign/${alice}/file`), { headers: baseHeaders() });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe(PDF_TYPE);
    expect(file.headers.get("content-disposition") ?? "").toMatch(/^inline/);
    expect(await pageCount(new Uint8Array(await file.arrayBuffer()))).toBe(2);
  });

  it("the final PDF is not available before everyone signed", async () => {
    const res = await fetch(url(`/api/sign/${alice}/file?final=1`), { headers: baseHeaders() });
    expect(res.status).toBe(409);
  });

  it("Bob cannot sign before Alice (ordered)", async () => {
    await expectJsonError(sign(bob, signForm("Bob")), 409, "can't be signed right now");
  });

  it("refuses an empty or malformed signature", async () => {
    const empty = new FormData();
    empty.append("overlays", "[]");
    await expectJsonError(sign(alice, empty), 400, "Place your signature");
    const bad = new FormData();
    bad.append("overlays", "{not json");
    await expectJsonError(sign(alice, bad), 400, "could not be read");
    const many = new FormData();
    many.append("overlays", JSON.stringify(Array.from({ length: 201 }, () => ({ kind: "line", page: 1, x1: 0, y1: 0, x2: 1, y2: 1, stroke: "#000", strokeWidth: 1 }))));
    await expectJsonError(sign(alice, many), 400, "Too many items");
  });

  it("refuses shapes, free drawing and unknown image keys (signers may only add signatures and text)", async () => {
    for (const ov of [
      { kind: "rect", page: 1, x: 0, y: 0, w: 595, h: 842, stroke: "#ffffff", fill: "#ffffff", strokeWidth: 1 },
      { kind: "line", page: 1, x1: 0, y1: 0, x2: 100, y2: 100, stroke: "#000000", strokeWidth: 1 },
      { kind: "path", page: 1, points: [[0, 0], [10, 10]], stroke: "#000000", strokeWidth: 1 },
      { kind: "image", page: 1, x: 0, y: 0, w: 10, h: 10, image: "logo" },
    ]) {
      const fd = new FormData();
      fd.append("overlays", JSON.stringify([ov]));
      await expectJsonError(sign(alice, fd), 400, "could not be read");
    }
  });

  it("Alice signs; she cannot sign twice", async () => {
    const r = await sign(alice, signForm("Alice"));
    expect(r.res.status, r.text).toBe(200);
    expect(r.body).toEqual({ ok: true });
    await expectJsonError(sign(alice, signForm("Alice")), 409, "already signed");
  });

  it("the manage link downloads the current (partly signed) document", async () => {
    const res = await fetch(url(`/api/sign-manage/${manage}?which=current`), { headers: baseHeaders() });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(PDF_TYPE);
    expect(await pageCount(new Uint8Array(await res.arrayBuffer()))).toBe(2);
  });

  it("remind works for anonymous signers (nobody to email) and unknown actions are refused", async () => {
    const remind = await fetch(url(`/api/sign-manage/${manage}`), {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ action: "remind" }),
    });
    expect(remind.status).toBe(200);
    const body = await remind.json();
    expect(body.ok).toBe(true);
    const bad = await fetch(url(`/api/sign-manage/${manage}`), {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ action: "delete-everything" }),
    });
    const text = await bad.text();
    await expectJsonError({ res: bad, body: JSON.parse(text), text }, 400, "Unknown action.");
  });

  it("Bob signs and the request is sealed with an audit trail", async () => {
    const r = await sign(bob, signForm("Bob", false));
    expect(r.res.status, r.text).toBe(200);

    const fin = await fetch(url(`/api/sign/${bob}/file?final=1`), { headers: baseHeaders() });
    expect(fin.status).toBe(200);
    expect(fin.headers.get("content-type")).toBe(PDF_TYPE);
    expect(fin.headers.get("content-disposition") ?? "").toMatch(/^attachment/);
    const bytes = new Uint8Array(await fin.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    // Two document pages plus at least one "Signature certificate" page.
    expect(doc.getPageCount()).toBeGreaterThan(2);
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toMatch(/\/ByteRange\s*\[/); // sealed with a digital signature

    const viaManage = await fetch(url(`/api/sign-manage/${manage}?which=final`), { headers: baseHeaders() });
    expect(viaManage.status).toBe(200);
    expect(await pageCount(new Uint8Array(await viaManage.arrayBuffer()))).toBe(doc.getPageCount());

    // Alice's link also gets the final copy.
    const viaAlice = await fetch(url(`/api/sign/${alice}/file?final=1`), { headers: baseHeaders() });
    expect(viaAlice.status).toBe(200);
  });

  it("after completion nobody can sign or decline", async () => {
    await expectJsonError(sign(bob, signForm("Bob")), 409);
    const decline = new FormData();
    decline.append("action", "decline");
    await expectJsonError(sign(bob, decline), 409);
  });
});

describe("parallel signers (no order)", () => {
  it("any signer may go first; completes after the last one", async () => {
    const created = await createOk([{ name: "One" }, { name: "Two" }, { name: "Three" }]);
    const [t1, t2, t3] = created.signers.map((s) => tokenOf(s.link));
    for (const [t, n] of [[t3, "Three"], [t1, "One"]] as const) {
      const r = await sign(t, signForm(n, false));
      expect(r.res.status, r.text).toBe(200);
    }
    expect((await fetch(url(`/api/sign/${t1}/file?final=1`), { headers: baseHeaders() })).status).toBe(409);
    const last = await sign(t2, signForm("Two"));
    expect(last.res.status, last.text).toBe(200);
    expect((await fetch(url(`/api/sign/${t1}/file?final=1`), { headers: baseHeaders() })).status).toBe(200);
  });
});

describe("decline and cancel", () => {
  it("a signer declining closes the request for everyone", async () => {
    const created = await createOk([{ name: "Dee" }, { name: "Eve" }]);
    const [dee, eve] = created.signers.map((s) => tokenOf(s.link));
    const fd = new FormData();
    fd.append("action", "decline");
    fd.append("reason", "Wrong amount");
    const r = await sign(dee, fd);
    expect(r.res.status, r.text).toBe(200);
    await expectJsonError(sign(eve, signForm("Eve")), 409, "can't be signed right now");
  });

  it("the owner can cancel through the manage link", async () => {
    const created = await createOk([{ name: "Fay" }]);
    const manage = tokenOf(created.manageLink);
    const res = await fetch(url(`/api/sign-manage/${manage}`), {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ action: "cancel" }),
    });
    expect(res.status).toBe(200);
    await expectJsonError(sign(tokenOf(created.signers[0].link), signForm("Fay")), 409);
  });
});

describe("validation and bad links", () => {
  it("refuses a request without a file, signers or sender name", async () => {
    await expectJsonError(createRequest({ signers: JSON.stringify([{ name: "A" }]), senderName: "S" }, null), 400, "Upload a PDF.");
    await expectJsonError(createRequest({ signers: "[]", senderName: "S" }), 400, "Add at least one signer.");
    await expectJsonError(createRequest({ signers: "not json", senderName: "S" }), 400, "Add at least one signer.");
    await expectJsonError(createRequest({ signers: JSON.stringify([{ name: "  " }]), senderName: "S" }), 400, "Enter a name for every signer.");
    await expectJsonError(createRequest({ signers: JSON.stringify([{ name: "A" }]) }), 400, "Enter your name");
  });

  it("refuses more than 20 signers", async () => {
    const signers = Array.from({ length: 21 }, (_, i) => ({ name: `S${i}` }));
    await expectJsonError(createRequest({ signers: JSON.stringify(signers), senderName: "S" }), 400, "at most 20 signers");
  });

  it("anonymous senders cannot have Workify email strangers", async () => {
    const signers = [{ name: "Victim", email: "victim@example.com" }];
    await expectJsonError(createRequest({ signers: JSON.stringify(signers), senderName: "S" }), 400, "verified email address");
  });

  it("refuses files that are not PDFs and invalid emails", async () => {
    await expectJsonError(createRequest({ signers: JSON.stringify([{ name: "A" }]), senderName: "S" }, new TextEncoder().encode("hello")), 400, "not a valid, unlocked PDF");
    await expectJsonError(createRequest({ signers: JSON.stringify([{ name: "A", email: "nope" }]), senderName: "S" }), 400, "not a valid email address");
  });

  it("a hostile file name is stored safely", async () => {
    const { res, body, text } = await createRequest(
      { signers: JSON.stringify([{ name: "<script>alert(1)</script>" }]), senderName: "<img src=x onerror=alert(1)>" },
      doc2,
      "../../../etc/passwd<script>.pdf",
    );
    expect(res.status, text).toBe(200);
    const created = body as Created;
    const page = await fetch(url(created.signers[0].link), { headers: baseHeaders() });
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("invalid tokens -> 404 everywhere", async () => {
    const fake = "A".repeat(43);
    await expectJsonError(sign(fake, signForm("x")), 404, "invalid or has expired");
    await expectJsonError(sign("short", signForm("x")), 404);
    expect((await fetch(url(`/api/sign/${fake}/file`))).status).toBe(404);
    expect((await fetch(url(`/api/sign-manage/${fake}`))).status).toBe(404);
    const post = await fetch(url(`/api/sign-manage/${fake}`), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const text = await post.text();
    await expectJsonError({ res: post, body: JSON.parse(text), text }, 404);
    // Owner download by request id requires a signed-in owner.
    const anon = await fetch(url(`/api/sign-requests/00000000/file`));
    expect(anon.status).toBe(404);
    expectNoLeak(await anon.text());
  });

  it("a signer token is not a manage token, and vice versa", async () => {
    const created = await createOk([{ name: "Gus" }]);
    const signer = tokenOf(created.signers[0].link);
    const manage = tokenOf(created.manageLink);
    expect((await fetch(url(`/api/sign-manage/${signer}`))).status).toBe(404);
    expect((await fetch(url(`/api/sign/${manage}/file`))).status).toBe(404);
  });

  it("the request id alone does not open the owner's download", async () => {
    const created = await createOk([{ name: "Hal" }]);
    const res = await fetch(url(`/api/sign-requests/${created.id}/file?which=current`), { headers: baseHeaders() });
    expect(res.status).toBe(404);
    // Legacy links used the 22-character request id as the signer token; new
    // requests must not accept it.
    expect(created.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await fetch(url(`/api/sign/${created.id}/file`))).status).toBe(404);
    await expectJsonError(sign(created.id, signForm("Hal")), 404);
  });
});
