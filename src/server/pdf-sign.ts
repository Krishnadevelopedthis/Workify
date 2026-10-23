import "server-only";
import { generateKeyPairSync, randomBytes, X509Certificate } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import signpdf from "@signpdf/signpdf";
import forge from "node-forge";
import type { PDFDocument } from "pdf-lib";
import { DATA_DIR } from "./db";

// Completed signature requests are sealed with a PKCS#7 digital signature, so
// any later change to the file shows up in PDF readers. By default Workify
// creates its own certificate in data/signing; set WORKIFY_SIGN_P12 (path) and
// WORKIFY_SIGN_P12_PASSWORD to use one issued by a certificate authority.

const SIGN_DIR = path.join(DATA_DIR, "signing");
const P12_FILE = path.join(SIGN_DIR, "workify-signing.p12");
const PASS_FILE = path.join(SIGN_DIR, "passphrase");

type Bundle = { p12: Buffer; passphrase: string };
let cached: Promise<Bundle> | null = null;

async function createSelfSigned(): Promise<Bundle> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs1", format: "pem" }).toString());
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: "spki", format: "pem" }).toString());
  cert.serialNumber = `01${randomBytes(8).toString("hex")}`;
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 86_400_000);
  const attrs = [
    { name: "commonName", value: "Workify Document Signing" },
    { name: "organizationName", value: "Workify" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
    { name: "subjectKeyIdentifier" },
  ]);
  cert.sign(key, forge.md.sha256.create());
  const passphrase = randomBytes(24).toString("base64url");
  const asn1 = forge.pkcs12.toPkcs12Asn1(key, [cert], passphrase, { algorithm: "aes256" });
  const p12 = Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
  await mkdir(SIGN_DIR, { recursive: true });
  await writeFile(P12_FILE, p12, { mode: 0o600 });
  await writeFile(PASS_FILE, passphrase, { mode: 0o600 });
  return { p12, passphrase };
}

async function loadBundle(): Promise<Bundle> {
  const custom = process.env.WORKIFY_SIGN_P12;
  if (custom) return { p12: await readFile(custom), passphrase: process.env.WORKIFY_SIGN_P12_PASSWORD ?? "" };
  if (existsSync(P12_FILE) && existsSync(PASS_FILE)) {
    return { p12: await readFile(P12_FILE), passphrase: (await readFile(PASS_FILE, "utf8")).trim() };
  }
  return createSelfSigned();
}

const bundle = () => (cached ??= loadBundle().catch((e) => ((cached = null), Promise.reject(e))));

/** Subject and SHA-256 fingerprint of the signing certificate (shown on the audit page). */
export async function certificateInfo(): Promise<{ subject: string; fingerprint: string; selfSigned: boolean }> {
  const { p12, passphrase } = await bundle();
  const parsed = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12.toString("binary")), passphrase);
  const bag = parsed.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!bag?.cert) throw new Error("The signing certificate could not be read.");
  const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(bag.cert)).getBytes(), "binary");
  const x509 = new X509Certificate(der);
  return { subject: x509.subject.replace(/\n/g, ", "), fingerprint: x509.fingerprint256, selfSigned: x509.subject === x509.issuer };
}

/**
 * Adds a signature placeholder to `doc`, saves it and fills in the PKCS#7
 * signature. Nothing may change the returned bytes afterwards.
 */
export async function sealPdf(doc: PDFDocument, info: { reason: string; location: string; contactInfo: string }) {
  const { p12, passphrase } = await bundle();
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: info.reason,
    location: info.location,
    contactInfo: info.contactInfo,
    name: "Workify",
    appName: "Workify",
    signatureLength: 16384,
  });
  // Object streams would hide the placeholder from the signer.
  const bytes = await doc.save({ useObjectStreams: false });
  return signpdf.sign(Buffer.from(bytes), new P12Signer(p12, { passphrase }));
}
