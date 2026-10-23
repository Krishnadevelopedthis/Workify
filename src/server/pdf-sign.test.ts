import { createHash } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import forge from "node-forge";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { certificateInfo, sealPdf } from "./pdf-sign";

// The self-signed certificate is written under DATA_DIR/signing; keep it out of the project.
const dataDir = vi.hoisted(() => ({ path: "" }));
vi.mock("./db", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  dataDir.path = mkdtempSync(path.join(tmpdir(), "workify-sign-"));
  return { DATA_DIR: dataDir.path };
});

beforeAll(() => {
  vi.stubEnv("WORKIFY_SIGN_P12", "");
});
afterAll(() => {
  vi.unstubAllEnvs();
  if (dataDir.path) rmSync(dataDir.path, { recursive: true, force: true });
});

async function samplePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  page.drawText("Signed by everyone", { x: 20, y: 100, font: await doc.embedFont(StandardFonts.Helvetica) });
  return doc;
}

describe("sealPdf", () => {
  it("adds a detached PKCS#7 signature covering the whole file", { timeout: 60_000 }, async () => {
    const signed = await sealPdf(await samplePdf(), {
      reason: "Signed with Workify",
      location: "Online",
      contactInfo: "test@example.com",
    });
    const text = signed.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("/adbe.pkcs7.detached");
    expect(text).toContain("/Reason (Signed with Workify)");

    // The placeholder's asterisks are replaced by real offsets.
    const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(text);
    expect(m).not.toBeNull();
    const [a, b, c, d] = m!.slice(1).map(Number);
    expect(a).toBe(0);
    expect(c + d).toBe(signed.length);
    // The gap between the two ranges is exactly the hex-encoded signature.
    const contents = text.slice(b, c);
    expect(contents).toMatch(/^<[0-9a-f]+>$/i);
    expect(contents.replace(/0+>$/, "").length).toBeGreaterThan(1000);

    // The signature's message digest matches the signed byte ranges.
    const padded = Buffer.from(contents.slice(1, -1), "hex");
    // Drop the zero padding after the DER structure (long-form length header).
    const lenBytes = padded[1] & 0x7f;
    const der = padded.subarray(0, 2 + lenBytes + padded.readUIntBE(2, lenBytes));
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der.toString("binary")));
    const attrs = (p7 as unknown as { rawCapture: { authenticatedAttributes: forge.asn1.Asn1[] } }).rawCapture
      .authenticatedAttributes;
    const digestAttr = attrs.find(
      (attr) => forge.asn1.derToOid((attr.value as forge.asn1.Asn1[])[0].value as string) === forge.pki.oids.messageDigest,
    );
    const digest = Buffer.from(((digestAttr!.value as forge.asn1.Asn1[])[1].value as forge.asn1.Asn1[])[0].value as string, "binary");
    const signedBytes = Buffer.concat([signed.subarray(a, a + b), signed.subarray(c, c + d)]);
    expect(digest.toString("hex")).toBe(createHash("sha256").update(signedBytes).digest("hex"));

    // The signed bytes still open as a PDF with the original page.
    const reopened = await PDFDocument.load(signed);
    expect(reopened.getPageCount()).toBe(1);
  });

  it("stores the generated certificate and reuses it", { timeout: 60_000 }, async () => {
    const info = await certificateInfo();
    const dir = path.join(dataDir.path, "signing");
    expect(existsSync(path.join(dir, "workify-signing.p12"))).toBe(true);
    expect(existsSync(path.join(dir, "passphrase"))).toBe(true);

    expect(info.selfSigned).toBe(true);
    expect(info.subject).toContain("CN=Workify Document Signing");
    expect(info.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect((await certificateInfo()).fingerprint).toBe(info.fingerprint);
  });
});
