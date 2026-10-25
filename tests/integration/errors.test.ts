// Invalid input to the website's endpoints must come back as clean JSON
// errors (right status, translated message, no stack traces), never a 500.
import http from "node:http";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  baseHeaders,
  expectJsonError,
  expectNoLeak,
  JPEG_BYTES,
  makePdf,
  pdfUpload,
  processOk,
  processRaw,
  url,
} from "./helpers";

let pdf1: Uint8Array;
let pdf3: Uint8Array;
const notAPdf = new TextEncoder().encode("this is not a pdf at all");

beforeAll(async () => {
  pdf1 = await makePdf(1);
  pdf3 = await makePdf(3);
});

describe("POST /api/process/[tool] request errors", () => {
  it("unknown tool -> 404 before the upload is read", async () => {
    await expectJsonError(processRaw("no-such-tool", [pdfUpload(pdf1)]), 404, "Unknown tool.");
    await expectJsonError(processRaw("..%2F..%2Fetc", [pdfUpload(pdf1)]), 404);
    await expectJsonError(processRaw("__proto__", [pdfUpload(pdf1)]), 404, "Unknown tool.");
    await expectJsonError(processRaw("constructor", [pdfUpload(pdf1)]), 404, "Unknown tool.");
  });

  it("error messages follow x-wf-lang", async () => {
    const es = await expectJsonError(processRaw("no-such-tool", [], undefined, {}, { "x-wf-lang": "es" }), 404);
    expect(es).toBe("Herramienta desconocida.");
    // An unknown language falls back to English.
    const xx = await expectJsonError(processRaw("no-such-tool", [], undefined, {}, { "x-wf-lang": "xx" }), 404);
    expect(xx).toBe("Unknown tool.");
  });

  it("GET is not allowed", async () => {
    const res = await fetch(url("/api/process/merge-pdf"), { headers: baseHeaders() });
    expect(res.status).toBe(405);
  });

  it("no files -> 400", async () => {
    await expectJsonError(processRaw("merge-pdf", []), 400, "Select at least one file.");
  });

  it("body that is not multipart -> 400", async () => {
    const res = await fetch(url("/api/process/merge-pdf"), {
      method: "POST",
      headers: baseHeaders({ "content-type": "text/plain" }),
      body: "hello",
    });
    const text = await res.text();
    await expectJsonError({ res, body: JSON.parse(text), text }, 400, "The upload could not be read.");
  });

  it("truncated multipart body -> 400", async () => {
    const res = await fetch(url("/api/process/merge-pdf"), {
      method: "POST",
      headers: baseHeaders({ "content-type": "multipart/form-data; boundary=XyZ" }),
      body: '--XyZ\r\nContent-Disposition: form-data; name="files"; filename="a.pdf"\r\n\r\n%PDF-1.4 trunc',
    });
    const text = await res.text();
    await expectJsonError({ res, body: JSON.parse(text), text }, 400, "The upload could not be read.");
  });

  it("chunked upload without Content-Length -> 411", async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("--x\r\n"));
        c.close();
      },
    });
    const res = await fetch(url("/api/process/merge-pdf"), {
      method: "POST",
      headers: baseHeaders({ "content-type": "multipart/form-data; boundary=x" }),
      body,
      duplex: "half",
    } as RequestInit);
    const text = await res.text();
    await expectJsonError({ res, body: JSON.parse(text), text }, 411);
  });

  it("declared body over 510 MB -> 413 before anything is read", async () => {
    const u = new URL(url("/api/process/merge-pdf"));
    const { status, text } = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = http.request(
        {
          host: u.hostname.replace(/^\[|\]$/g, ""),
          port: u.port,
          path: u.pathname,
          method: "POST",
          headers: { ...baseHeaders(), "content-type": "multipart/form-data; boundary=x", "content-length": String(600 * 1024 * 1024) },
        },
        (res) => {
          let data = "";
          res.on("data", (d) => (data += d));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, text: data }));
        },
      );
      req.on("error", reject);
      req.write("--x\r\n"); // a few bytes; the server must answer from the headers alone
      setTimeout(() => req.destroy(), 30_000).unref();
    });
    expect(status).toBe(413);
    expect(JSON.parse(text).error).toBe("All files together can be at most 500 MB.");
  });

  it("options that are not JSON -> 400", async () => {
    await expectJsonError(processRaw("merge-pdf", [pdfUpload(pdf1), pdfUpload(pdf1)], "{not json"), 400, "The tool settings could not be read.");
  });

  it("nested option JSON that is not JSON -> 400, not 500", async () => {
    await expectJsonError(processRaw("rotate-pdf", [pdfUpload(pdf1)], { rotations: "{oops" }), 400, "could not be read");
    await expectJsonError(processRaw("organize-pdf", [pdfUpload(pdf1)], { pages: "[" }), 400, "could not be read");
    await expectJsonError(processRaw("edit-pdf", [pdfUpload(pdf1)], { overlays: "{" }), 400, "could not be read");
  });

  it("a non-PDF named .pdf -> 400 naming the file", async () => {
    for (const tool of ["merge-pdf", "split-pdf", "rotate-pdf", "add-page-numbers", "compress-pdf", "pdf-to-word"]) {
      const files = tool === "merge-pdf" ? [pdfUpload(notAPdf, "fake.pdf"), pdfUpload(pdf1)] : [pdfUpload(notAPdf, "fake.pdf")];
      const { res, text } = await processRaw(tool, files, {});
      expect(res.status, `${tool}: ${text}`).toBe(400);
      expectNoLeak(text);
    }
  });

  // BUG(qpdf-invalid-pdf): expected protect-pdf / unlock-pdf given a file that
  // is not a PDF to answer 400 naming the file, like the pdf-lib tools do.
  // Actual: 500 "Something went wrong while processing your files." because
  // protect/unlock in src/server/processors.ts rethrow qpdf's "not a PDF"
  // error instead of turning it into a ToolError (so it is logged as a crash).
  it("protect-pdf / unlock-pdf with a non-PDF -> 400 naming the file", async () => {
    await expectJsonError(processRaw("protect-pdf", [pdfUpload(notAPdf, "fake.pdf")], { password: "a", repeat: "a" }), 400, "fake.pdf");
    await expectJsonError(processRaw("unlock-pdf", [pdfUpload(notAPdf, "fake.pdf")], {}), 400, "fake.pdf");
  });

  it("merge-pdf with one file -> 400", async () => {
    await expectJsonError(processRaw("merge-pdf", [pdfUpload(pdf1)]), 400, "at least 2");
  });

  it("single-file tools refuse several files", async () => {
    for (const tool of ["split-pdf", "crop-pdf", "redact-pdf", "pdf-forms", "edit-pdf", "remove-pages"]) {
      await expectJsonError(processRaw(tool, [pdfUpload(pdf1), pdfUpload(pdf1)]), 400, "one file at a time");
    }
  });

  it("more than 100 files -> 400", async () => {
    const tiny = new Uint8Array([1]);
    const files = Array.from({ length: 101 }, (_, i) => ({ name: `f${i}.pdf`, bytes: tiny }));
    await expectJsonError(processRaw("compress-pdf", files), 400, "at most 100 files");
  });

  it("page selections that are empty, out of range or remove everything -> 400", async () => {
    await expectJsonError(processRaw("remove-pages", [pdfUpload(pdf3)], { pages: "" }), 400, "Choose the pages");
    await expectJsonError(processRaw("remove-pages", [pdfUpload(pdf3)], { pages: "1-3" }), 400, "Keep at least one page");
    await expectJsonError(processRaw("extract-pages", [pdfUpload(pdf3)], { pages: " " }), 400, "Choose the pages");
    const out = await processRaw("extract-pages", [pdfUpload(pdf3)], { pages: "99" });
    expect(out.res.status, out.text).toBe(400);
    expectNoLeak(out.text);
    const bad = await processRaw("split-pdf", [pdfUpload(pdf3)], { mode: "custom", ranges: "abc" });
    expect(bad.res.status, bad.text).toBe(400);
    const zero = await processRaw("split-pdf", [pdfUpload(pdf3)], { mode: "custom", ranges: "0-2" });
    expect(zero.res.status, zero.text).toBe(400);
  });

  it("split-pdf refuses huge range lists instead of building them", async () => {
    const ranges = Array.from({ length: 2000 }, () => "1-3").join(",");
    const { res, text } = await processRaw("split-pdf", [pdfUpload(pdf3)], { mode: "custom", ranges });
    expect(res.status, text).toBe(400);
    expectNoLeak(text);
  });

  it("organize-pdf with no pages -> 400; bogus items are skipped", async () => {
    await expectJsonError(processRaw("organize-pdf", [pdfUpload(pdf1)], { pages: [] }), 400, "no pages left");
    const r = await processOk("organize-pdf", [pdfUpload(pdf3)], { pages: [{ file: 9, page: 1 }, { file: 0, page: 99 }, null, { file: 0, page: 2 }] });
    expect(r.count).toBe(1);
  });

  it("crop-pdf without a usable box -> 400", async () => {
    await expectJsonError(processRaw("crop-pdf", [pdfUpload(pdf1)], {}), 400, "Select the area");
    await expectJsonError(processRaw("crop-pdf", [pdfUpload(pdf1)], { box: { x: 0, y: 0, width: 1, height: 1 } }), 400, "Select the area");
  });

  it("edit-pdf / sign-pdf without overlays -> 400", async () => {
    await expectJsonError(processRaw("edit-pdf", [pdfUpload(pdf1)], {}), 400, "Add some text");
    await expectJsonError(processRaw("sign-pdf", [pdfUpload(pdf1)], { overlays: [] }), 400, "Place your signature");
  });

  it("edit-pdf with too many overlays -> 400", async () => {
    const overlays = Array.from({ length: 2001 }, () => ({ kind: "line", page: 1, x1: 0, y1: 0, x2: 1, y2: 1, stroke: "#000", strokeWidth: 1 }));
    await expectJsonError(processRaw("edit-pdf", [pdfUpload(pdf1)], { overlays }), 400, "At most 2000");
  });

  it("edit-pdf clamps absurd coordinates and page numbers instead of failing", async () => {
    const overlays = [
      { kind: "text", page: 999, x: 1e12, y: -1e12, text: "far away", size: 1e9, color: "not-a-color", font: "Nope" },
      { kind: "rect", page: -5, x: "NaN", y: null, w: 1e9, h: -4, stroke: "#zzzzzz", strokeWidth: 9999 },
    ];
    const r = await processOk("edit-pdf", [pdfUpload(pdf1)], { overlays });
    expect(r.count).toBe(1);
  });

  it("edit-pdf with a corrupt image overlay -> 400", async () => {
    const overlays = [{ kind: "image", page: 1, x: 0, y: 0, w: 10, h: 10, image: "bad" }];
    const { res, text } = await processRaw("edit-pdf", [pdfUpload(pdf1)], { overlays }, { bad: { name: "x.png", bytes: notAPdf, type: "image/png" } });
    expect(res.status, text).toBe(400);
    expectNoLeak(text);
  });

  it("jpg-to-pdf with a file that is not an image -> 400 naming it", async () => {
    await expectJsonError(processRaw("jpg-to-pdf", [{ name: "x.jpg", bytes: notAPdf, type: "image/jpeg" }]), 400, '"x.jpg" is not a supported image.');
  });

  it("jpg-to-pdf refuses a PNG that declares billions of pixels (decompression bomb)", async () => {
    // Only the header: 100000 x 100000 RGB.
    const head = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
    head.writeUInt32BE(13, 8);
    head.write("IHDR", 12, "latin1");
    head.writeUInt32BE(100_000, 16);
    head.writeUInt32BE(100_000, 20);
    head[24] = 8;
    head[25] = 2;
    const { res, text } = await processRaw("jpg-to-pdf", [{ name: "bomb.png", bytes: new Uint8Array(head), type: "image/png" }]);
    expect(res.status, text).toBe(400);
    expectNoLeak(text);
  });

  it("office converters check the extension and magic bytes", async () => {
    await expectJsonError(processRaw("word-to-pdf", [{ name: "evil.exe", bytes: notAPdf }]), 400, "could not be converted");
    await expectJsonError(processRaw("word-to-pdf", [{ name: "fake.docx", bytes: notAPdf }]), 400, "could not be converted");
    await expectJsonError(processRaw("excel-to-pdf", [{ name: "pic.xlsx", bytes: JPEG_BYTES }]), 400, "could not be converted");
    await expectJsonError(processRaw("powerpoint-to-pdf", [{ name: "doc.pdf", bytes: pdf1 }]), 400, "could not be converted");
  });

  it("OCR languages are validated", async () => {
    await expectJsonError(processRaw("ocr-pdf", [pdfUpload(pdf1)], { language: "xxx" }), 400, "Unsupported OCR language: xxx.");
    await expectJsonError(processRaw("ocr-pdf", [pdfUpload(pdf1)], { language: "eng+hin+spa+fra+deu+ita" }), 400, "at most 5 languages");
    await expectJsonError(processRaw("pdf-to-word", [pdfUpload(pdf1)], { ocr: true, language: "../../etc" }), 400, "Unsupported OCR language");
  });

  it("watermark without text -> 400", async () => {
    await expectJsonError(processRaw("add-watermark", [pdfUpload(pdf1)], { kind: "text", text: "   " }), 400, "Type the watermark text.");
  });

  it("html-to-pdf without a valid address -> 400", async () => {
    await expectJsonError(processRaw("html-to-pdf", [], {}), 400);
    await expectJsonError(processRaw("html-to-pdf", [], { url: "http://" }), 400, "valid web address");
    await expectJsonError(processRaw("html-to-pdf", [], { url: "https://no-such-host.invalid" }), 400, "Could not find the website");
  });

  it("password-protected input to a pdf-lib tool -> 400 asking to unlock", async () => {
    const locked = await processOk("protect-pdf", [pdfUpload(pdf1, "l.pdf")], { password: "pw", repeat: "pw" });
    const bytes = new Uint8Array(await (await fetch(url(locked.downloadUrl))).arrayBuffer());
    for (const tool of ["rotate-pdf", "add-page-numbers", "pdf-to-word"]) {
      const { res, text } = await processRaw(tool, [pdfUpload(bytes, "l.pdf")], {});
      expect(res.status, `${tool}: ${text}`).toBe(400);
      expectNoLeak(text);
    }
    await expectJsonError(processRaw("protect-pdf", [pdfUpload(bytes, "l.pdf")], { password: "x", repeat: "x" }), 400, "already password protected");
  });
});

describe("GET /api/download/[job]/[file] and DELETE /api/jobs/[job]", () => {
  it("unknown jobs and files -> 404 without detail", async () => {
    const res = await fetch(url("/api/download/00000000-0000-0000-0000-000000000000/x.pdf"));
    expect(res.status).toBe(404);
    const bad = await fetch(url("/api/download/not-a-job/x.pdf"));
    expect(bad.status).toBe(404);
  });

  it("path traversal in the job or file name never escapes the job folder", async () => {
    const r = await processOk("rotate-pdf", [pdfUpload(pdf1, "t.pdf")], { rotations: { 0: { all: 90 } } });
    for (const file of ["..%2F..%2F..%2Fpackage.json", "..%5C..%5Cpackage.json", "%2e%2e%2f%2e%2e%2fpackage.json", "..%252F..%252Fpackage.json"]) {
      const res = await fetch(url(`/api/download/${r.jobId}/${file}`));
      const text = await res.text();
      expect(res.status, file).toBe(404);
      expect(text).not.toContain('"name": "workify"');
    }
    for (const job of ["..", "..%2F..", "%2e%2e"]) {
      const res = await fetch(url(`/api/download/${job}/package.json`));
      expect(res.status, job).toBe(404);
    }
    const res = await fetch(url(`/api/jobs/..%2F..`), { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("files outside download/ in a job folder are not served", async () => {
    const r = await processOk("rotate-pdf", [pdfUpload(pdf1, "t.pdf")], { rotations: { 0: { all: 90 } } });
    // The upload itself is stored in the job folder too, but only download/ is public.
    // Names are reduced to their basename and looked up in download/ only, so
    // "../in/000_t.pdf" (where the upload is) means download/000_t.pdf, which does not exist.
    for (const file of ["t.pdf", "000_t.pdf", "..%2Fin%2F000_t.pdf", "..%5Cin%5C000_t.pdf", "..%2F..%2F" + "00000000-0000-0000-0000-000000000000%2Fin%2F000_t.pdf"]) {
      const res = await fetch(url(`/api/download/${r.jobId}/${file}`));
      expect(res.status, file).toBe(404);
    }
  });
});

describe("/api/jobs robustness", () => {
  it("DELETE a malformed job id -> 404 JSON; a well-formed unknown id is an idempotent ok", async () => {
    for (const id of ["not-a-job", "00000000"]) {
      const res = await fetch(url(`/api/jobs/${id}`), { method: "DELETE" });
      expect(res.status, id).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
    const res = await fetch(url("/api/jobs/00000000-0000-0000-0000-000000000000"), { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("BASE_URL is the server under test", () => {
    expect(BASE_URL).toMatch(/^https?:\/\//);
  });
});
