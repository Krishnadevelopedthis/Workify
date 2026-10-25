import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import type { User } from "./auth";

// sign-requests pulls in the database and the mailer; only its limit is needed here.
vi.mock("./sign-requests", () => ({ MAX_SIGNERS: 20 }));

const { parseSigners, SignInputError, validateSignInput } = await import("./sign-input");

const verified = { id: 1, name: "Asha", email: "asha@example.com", verified: true } as unknown as User;
const unverified = { id: 2, name: "Ben", email: "ben@example.com", verified: false } as unknown as User;

async function pdfFile(name = "contract.pdf", pages = 1) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return new File([new Uint8Array(await doc.save())], name, { type: "application/pdf" });
}

function errorOf(fn: () => unknown): InstanceType<typeof SignInputError> {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(SignInputError);
    return e as InstanceType<typeof SignInputError>;
  }
  throw new Error("expected a SignInputError");
}

async function asyncErrorOf(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(SignInputError);
  return e as InstanceType<typeof SignInputError>;
}

describe("SignInputError", () => {
  it("keeps the template for translation and fills the English message", () => {
    const e = new SignInputError("A request can have at most {max} signers.", { max: 20 });
    expect(e.template).toBe("A request can have at most {max} signers.");
    expect(e.message).toBe("A request can have at most 20 signers.");
  });

  it("leaves unknown placeholders and never re-expands values", () => {
    const e = new SignInputError("{a} and {b}", { a: "{b}" });
    expect(e.message).toBe("{b} and {b}");
  });
});

describe("parseSigners", () => {
  it("trims names, lower-cases emails and allows signers without email", () => {
    expect(
      parseSigners([
        { name: "  Asha  ", email: "  ASHA@Example.COM " },
        { name: "Ben", email: "" },
        { name: "Chen" },
      ]),
    ).toEqual([
      { name: "Asha", email: "asha@example.com" },
      { name: "Ben", email: null },
      { name: "Chen", email: null },
    ]);
  });

  it.each([[undefined], [null], ["x"], [{}], [[]]])("requires a non-empty list (%j)", (raw) => {
    expect(errorOf(() => parseSigners(raw)).template).toBe("Add at least one signer.");
  });

  it("allows exactly the maximum and refuses one more", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `S${i}`, email: `s${i}@example.com` }));
    expect(parseSigners(many(20))).toHaveLength(20);
    const e = errorOf(() => parseSigners(many(21)));
    expect(e.vars).toEqual({ max: 20 });
  });

  it.each([[{ name: "" }], [{ name: "   " }], [{ email: "a@b.co" }], [null], ["just a string"], [42]])(
    "requires a name for every signer (%j)",
    (s) => {
      expect(errorOf(() => parseSigners([s])).template).toBe("Enter a name for every signer.");
    },
  );

  it.each(["plain", "a@b", "@b.co", "a@.co", "a b@c.co", "a@b@c.co", "a@b.co\nBcc: x@y.z"])("rejects the address %j", (email) => {
    expect(errorOf(() => parseSigners([{ name: "A", email }])).template).toMatch(/not a valid email address/);
  });

  it("refuses the same address twice, ignoring case", () => {
    const e = errorOf(() =>
      parseSigners([
        { name: "A", email: "x@example.com" },
        { name: "B", email: "X@EXAMPLE.com" },
      ]),
    );
    expect(e.vars).toEqual({ email: "x@example.com" });
  });

  it("allows several signers without email", () => {
    expect(parseSigners([{ name: "A" }, { name: "B" }])).toHaveLength(2);
  });

  it("cuts names to 100 characters and keeps unicode", () => {
    expect(parseSigners([{ name: "x".repeat(500) }])[0].name).toHaveLength(100);
    expect(parseSigners([{ name: "राहुल शर्मा" }])[0].name).toBe("राहुल शर्मा");
  });

  it("turns non-string fields into strings instead of crashing", () => {
    expect(parseSigners([{ name: 123 as unknown as string, email: null }])).toEqual([{ name: "123", email: null }]);
  });

  // BUG(sign-input-ctrl): expected control characters (CR/LF, NUL) to be removed
  // from signer names, since names are used in email subjects ("{name} signed
  // {file}") and the audit trail; actual: they are kept verbatim.
  it("removes control characters from names", () => {
    expect(parseSigners([{ name: "Eve\r\nBcc: victim@example.com\u0000" }])[0].name).not.toMatch(/[\r\n\u0000]/);
  });
});

describe("validateSignInput", () => {
  const base = { message: "", ordered: false, reminderDays: 0, senderName: "Guest" };

  it("returns a clean request for a valid PDF", async () => {
    const r = await validateSignInput({
      ...base,
      file: await pdfFile("../../Contract 2026.pdf"),
      signers: [{ name: "A", email: "a@example.com" }],
      message: `  ${"m".repeat(2000)}  `,
      ordered: "true",
      reminderDays: "3",
      user: verified,
    });
    expect(r.fileName).toBe("Contract 2026.pdf");
    expect(r.signers).toEqual([{ name: "A", email: "a@example.com" }]);
    expect(r.message).toHaveLength(1000);
    expect(r.ordered).toBe(true);
    expect(r.reminderDays).toBe(3);
    // A logged-in sender's account name and address win over the form.
    expect(r.senderName).toBe("Asha");
    expect(r.senderEmail).toBe("asha@example.com");
    expect(r.bytes.byteLength).toBeGreaterThan(0);
  });

  it("requires a file", async () => {
    expect((await asyncErrorOf(validateSignInput({ ...base, file: null, signers: [{ name: "A" }], user: null }))).template).toBe(
      "Upload a PDF.",
    );
  });

  it("refuses non-PDFs and empty files", async () => {
    for (const file of [new File(["hello"], "x.pdf"), new File([], "empty.pdf")]) {
      const e = await asyncErrorOf(validateSignInput({ ...base, file, signers: [{ name: "A" }], user: null }));
      expect(e.template).toBe("This file is not a valid, unlocked PDF.");
    }
  });

  // BUG(sign-input-junk-pdf): expected a file that only has a "%PDF-" header
  // followed by junk to be refused up front, like loadPdf does (it calls
  // getPageCount()); actual: PDFDocument.load() succeeds on it, so the request
  // is created and fails later when a signer opens or signs it.
  it("refuses a PDF header followed by junk", async () => {
    const file = new File(["%PDF-1.7\njunk"], "fake.pdf");
    const e = await asyncErrorOf(validateSignInput({ ...base, file, signers: [{ name: "A" }], user: null }));
    expect(e.template).toBe("This file is not a valid, unlocked PDF.");
  });

  it("only lets verified accounts invite by email", async () => {
    const file = await pdfFile();
    const signers = [{ name: "A", email: "a@example.com" }];
    for (const user of [null, unverified]) {
      const e = await asyncErrorOf(validateSignInput({ ...base, file, signers, user }));
      expect(e.template).toMatch(/verified email address/);
    }
  });

  it("lets guests share links themselves, but needs their name", async () => {
    const file = await pdfFile();
    const r = await validateSignInput({ ...base, file, signers: [{ name: "A" }], senderName: "  Guest  ", user: null });
    expect(r.senderName).toBe("Guest");
    expect(r.senderEmail).toBeNull();
    const e = await asyncErrorOf(validateSignInput({ ...base, file, signers: [{ name: "A" }], senderName: "  ", user: null }));
    expect(e.template).toMatch(/Enter your name/);
  });

  it.each([
    [0, 0],
    [1, 1],
    [7, 7],
    ["2", 2],
    [2.4, 2],
    [5, 0],
    [-1, 0],
    [365, 0],
    ["abc", 0],
    [null, 0],
    [Infinity, 0],
  ])("only allows the offered reminder intervals (%j -> %j)", async (reminderDays, expected) => {
    const r = await validateSignInput({ ...base, file: await pdfFile(), signers: [{ name: "A" }], reminderDays, user: null });
    expect(r.reminderDays).toBe(expected);
  });

  it.each([
    [true, true],
    ["true", true],
    ["1", false],
    ["yes", false],
    [1, false],
    [undefined, false],
  ])("reads ordered=%j as %j", async (ordered, expected) => {
    const r = await validateSignInput({ ...base, file: await pdfFile(), signers: [{ name: "A" }], ordered, user: null });
    expect(r.ordered).toBe(expected);
  });

  it("refuses files over 100 MB before reading them", async () => {
    const big = { size: 100 * 1024 * 1024 + 1, name: "big.pdf", arrayBuffer: () => Promise.reject(new Error("read")) };
    Object.setPrototypeOf(big, File.prototype);
    const e = await asyncErrorOf(validateSignInput({ ...base, file: big as unknown as File, signers: [{ name: "A" }], user: null }));
    expect(e.template).toMatch(/at most 100 MB/);
  });

  it("validates signers before parsing the PDF", async () => {
    const e = await asyncErrorOf(validateSignInput({ ...base, file: new File(["junk"], "x.pdf"), signers: [], user: null }));
    expect(e.template).toBe("Add at least one signer.");
  });
});
