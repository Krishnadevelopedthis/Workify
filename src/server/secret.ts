import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

// Server secret for values that must be readable again later (signing links
// that are emailed more than once) and for webhook signatures. Set
// WORKIFY_SECRET in production; otherwise one is generated in data/secret.key.

const KEY_FILE = path.join(DATA_DIR, "secret.key");
let key: Buffer | null = null;

function serverKey(): Buffer {
  if (key) return key;
  const fromEnv = process.env.WORKIFY_SECRET;
  if (fromEnv) return (key = createHash("sha256").update(fromEnv).digest());
  if (!existsSync(KEY_FILE)) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(KEY_FILE, randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  return (key = createHash("sha256").update(readFileSync(KEY_FILE, "utf8").trim()).digest());
}

/** A stable secret for one purpose (e.g. a user's webhook signing secret). */
export function derive(label: string): string {
  return createHmac("sha256", serverKey()).update(label).digest("base64url");
}

/** AES-256-GCM encryption to a compact string. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", serverKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function unseal(sealed: string): string | null {
  try {
    const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", serverKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
