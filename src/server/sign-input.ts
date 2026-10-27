import "server-only";
import { PDFDocument } from "pdf-lib";
import type { User } from "./auth";
import { safeName } from "./jobs";
import { MAX_SIGNERS, type NewSigner } from "./sign-requests";
import { cleanLine, cleanText, isEmail, normalizeEmail } from "@/lib/validation";

// Validation of a new signature request, used by the website.

export class SignInputError extends Error {
  constructor(
    readonly template: string,
    readonly vars?: Record<string, string | number>,
  ) {
    super(vars ? template.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m)) : template);
  }
}

/** The account sent its daily share of invitation emails (sign-requests.ts counts them). */
export function inviteLimitError(max: number) {
  return new SignInputError(
    "You have reached today's limit of {max} signing invitations. Try again tomorrow, or leave the email fields empty and share the links yourself.",
    { max },
  );
}

export function parseSigners(raw: unknown): NewSigner[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new SignInputError("Add at least one signer.");
  if (raw.length > MAX_SIGNERS) throw new SignInputError("A request can have at most {max} signers.", { max: MAX_SIGNERS });
  const seen = new Set<string>();
  return raw.map((s) => {
    const name = cleanLine((s as NewSigner)?.name, 100);
    const email = normalizeEmail((s as NewSigner)?.email) || null;
    if (!name) throw new SignInputError("Enter a name for every signer.");
    if (email && !isEmail(email)) throw new SignInputError('"{email}" is not a valid email address.', { email });
    if (email && seen.has(email)) throw new SignInputError('"{email}" is listed twice.', { email });
    if (email) seen.add(email);
    return { name, email };
  });
}

export type ValidSignInput = {
  fileName: string;
  bytes: Uint8Array;
  signers: NewSigner[];
  message: string;
  ordered: boolean;
  reminderDays: number;
  senderName: string;
  senderEmail: string | null;
};

export async function validateSignInput(opts: {
  file: File | null;
  signers: unknown;
  message: unknown;
  ordered: unknown;
  reminderDays: unknown;
  senderName: unknown;
  user: User | null;
}): Promise<ValidSignInput> {
  const { file, user } = opts;
  if (!(file instanceof File)) throw new SignInputError("Upload a PDF.");
  if (file.size > 100 * 1024 * 1024) throw new SignInputError("The file can be at most 100 MB.");
  const signers = parseSigners(opts.signers);
  // Invitations are emails to addresses the sender typed: only verified accounts may send them.
  if (signers.some((s) => s.email) && !user?.verified) {
    throw new SignInputError("Log in with a verified email address to invite signers by email, or leave the email fields empty and share the links yourself.");
  }
  const senderName = cleanLine(user?.name ?? opts.senderName, 100);
  if (!senderName) throw new SignInputError("Enter your name, so signers know who sent the document.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const doc = await PDFDocument.load(bytes); // reject non-PDFs and locked PDFs up front
    doc.getPageCount(); // a "%PDF-" header with junk after it only fails here (as in loadPdf)
  } catch {
    throw new SignInputError("This file is not a valid, unlocked PDF.");
  }
  const days = Math.round(Number(opts.reminderDays) || 0);
  return {
    fileName: safeName(file.name),
    bytes,
    signers,
    message: cleanText(opts.message, 1000),
    ordered: opts.ordered === true || opts.ordered === "true",
    reminderDays: [0, 1, 2, 3, 7].includes(days) ? days : 0,
    senderName,
    senderEmail: user?.email ?? null,
  };
}
