# Workify

Free online PDF tools: merge, split, compress, convert (Word, PowerPoint, Excel,
JPG, HTML, PDF/A, Markdown), edit, sign, watermark, redact, compare, OCR, forms,
scan-to-PDF and reusable workflows. Built with Next.js 16.

## Requirements

| Engine | Used for | Windows install |
|---|---|---|
| Node.js 24+ | the app | nodejs.org |
| Python 3.13 venv in `py/.venv` | PDF→Word/Excel/PPT/Markdown/JPG, redact, OCR | `python -m venv py/.venv` then `py/.venv/Scripts/pip install pdf2docx pdfplumber openpyxl python-pptx pymupdf pymupdf4llm ocrmypdf` |
| Ghostscript 10 | compress, PDF/A, OCR | official installer from Artifex |
| qpdf | protect, unlock, repair | `winget install QPDF.QPDF` |
| LibreOffice | Word/PPT/Excel→PDF | `winget install TheDocumentFoundation.LibreOffice` |
| Tesseract | OCR | `winget install UB-Mannheim.TesseractOCR` |
| Chrome or Edge | HTML→PDF | already on most PCs |

Engines are found automatically in their default folders. Override any of them
with `WORKIFY_GS`, `WORKIFY_QPDF`, `WORKIFY_SOFFICE`, `WORKIFY_TESSERACT`,
`WORKIFY_PYTHON`, `WORKIFY_CHROME`.

## Run

```bash
npm install
npm run dev            # development, http://localhost:3000
npm run build && npx next start -H 127.0.0.1 -p 3000   # production
```

Optional Google Drive / Dropbox import: see [CLOUD_SETUP.md](CLOUD_SETUP.md).

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | public URL for canonical links, sitemap, social previews |
| `WORKIFY_TRUST_PROXY` | off | set to `1` only behind a reverse proxy that sets `X-Forwarded-For` |
| `WORKIFY_MAX_JOBS` | `4` | heavy conversions running at once |
| `WORKIFY_MAX_QUEUE` | `20` | conversions allowed to wait before “busy” is returned |
| `WORKIFY_PY_WORKERS` | `2` | warm Python worker processes |

## Deploying safely

1. **Put it behind a reverse proxy with HTTPS** (Caddy, nginx or a CDN such as
   Cloudflare). Run Next on `127.0.0.1` so only the proxy can reach it, and set
   `WORKIFY_TRUST_PROXY=1` so per-client rate limits use the real client IP.
   Without a proxy, per-client limits can be evaded by forging
   `X-Forwarded-For`; the global limits and the job queue still protect the server.
2. **CDN**: all marketing and tool pages are prerendered and served with
   `s-maxage`; `/_next/static/*` files are immutable. A CDN in front caches them
   with no extra configuration. `/api/*`, `/account`, `/login`, `/signup` and
   `/sign/*` are per-user and are not cached.
3. **Firewall**: expose only ports 80/443 of the proxy. Never expose the Next
   port, databases or other services directly.
4. **Data**: `data/` holds the SQLite database and signature requests; back it
   up and keep it out of the web root (it is, by default).

## Security measures in the app

- Per-client + global rate limits, a bounded job queue, upload size and count limits
  checked before the body is read.
- CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS;
  no `X-Powered-By`.
- Passwords hashed with scrypt; constant-time comparison; equal-time failures for unknown
  emails; login limited per IP and per email; sessions stored as SHA-256 hashes in
  http-only, SameSite=Lax cookies; changing the password signs out other devices.
- Safe redirects after login (no open redirect).
- Uploaded files live in random, unguessable job folders, are never served from the
  project folder, and are deleted after one hour (immediately on failure).
- HTML→PDF blocks private/loopback/link-local addresses, also on redirects.
- PDF passwords are passed to qpdf through a temporary args file, not the process list.
- Ghostscript runs with `-dSAFER`; Python runs isolated (`-I`).
- All coordinates, sizes and texts from the editors are validated and clamped server-side.
