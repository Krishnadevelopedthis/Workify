# Workify

Free online PDF tools: merge, split, remove and extract pages, compress, convert
(Word, PowerPoint, Excel, JPG, HTML, PDF/A, Markdown — with OCR for scanned
PDFs), edit, sign, watermark, redact, compare, OCR, forms, scan-to-PDF and
reusable workflows. Built with Next.js 16. Every feature is free; there are no
paid plans (the Premium card on the pricing page is a "coming soon" waitlist).

## Features

- **30+ PDF tools**, batch processing, files up to 200 MB each.
- **OCR** in 34 languages, also as an option of PDF → Word, PowerPoint and Excel
  for scanned documents.
- **Signature requests**: up to 20 signers, optional signing order, email
  invitations and reminders, decline, reusable templates, an audit trail page
  and a PKCS#7 digital seal on the final PDF.
- **Accounts**: sign up, email verification, password reset, change email,
  delete account; saved workflows and signature requests.
- **Admin panel** at `/admin`: users, signature requests, outbox, errors,
  contact messages, Premium waitlist, backups and a system check.
- **Developer API** at `/api/v1` with personal API keys, background tasks and
  signed webhooks; works with Zapier and Make. Docs at `/developers`.
- **11 languages** (en, hi, es, fr, de, pt, ar, id, ja, ru, zh). English URLs have
  no prefix, the others start with the language (`/hi/merge-pdf`); Arabic is
  right-to-left.
- **Installable app** (PWA), optional Google Drive / Dropbox open and save.
- **Health endpoint** `/api/health` and automatic daily database backups.

## Requirements

| Engine | Used for | Windows install |
|---|---|---|
| Node.js 24+ | the app (uses the built-in `node:sqlite`) | nodejs.org |
| Python 3.13 venv in `py/.venv` | PDF→Word/Excel/PPT/Markdown/JPG, redact, OCR | `python -m venv py/.venv` then `py/.venv/Scripts/pip install -r py/requirements.txt` |
| Ghostscript 10 | compress, PDF/A, OCR | official installer from Artifex |
| qpdf | protect, unlock, repair | `winget install QPDF.QPDF` |
| LibreOffice | Word/PPT/Excel→PDF | `winget install TheDocumentFoundation.LibreOffice` |
| Tesseract | OCR | `winget install UB-Mannheim.TesseractOCR` |
| Chrome or Edge | HTML→PDF | already on most PCs |

Engines are found automatically in their default folders. Override any of them
with `WORKIFY_GS`, `WORKIFY_QPDF`, `WORKIFY_SOFFICE`, `WORKIFY_TESSERACT`,
`WORKIFY_PYTHON`, `WORKIFY_CHROME`. The Docker image includes all of them.

## Run

```bash
npm install
npm run ocr-languages  # once: OCR data for 34 languages into data/tessdata
npm run dev            # development, http://localhost:3000
npm test               # unit tests
npm run build && npx next start -H 127.0.0.1 -p 3000   # production
```

- Going live: see [DEPLOY.md](DEPLOY.md) (Docker image with every engine included).
- Optional Google Drive / Dropbox: see [CLOUD_SETUP.md](CLOUD_SETUP.md).
- All settings are listed in [.env.example](.env.example). Copy it to
  `.env.local` for development; never commit real values.

## Configuration (environment variables)

Everything is optional; the app runs with no settings at all. The full list with
details is in [DEPLOY.md](DEPLOY.md#environment-variables).

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | public URL for links in emails, canonical links, sitemap (build time) |
| `WORKIFY_SECRET` | generated in `data/secret.key` | server secret for signing links and webhook signatures |
| `WORKIFY_ADMIN_EMAILS` | — | comma-separated emails that are admins (once verified) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | not set, `587` | outgoing email; without `SMTP_HOST` emails stay in the admin outbox |
| `MAIL_FROM` | `Workify <no-reply@your-host>` | sender address |
| `WORKIFY_SIGN_P12`, `WORKIFY_SIGN_P12_PASSWORD` | self-signed certificate | your own certificate for the digital seal |
| `WORKIFY_BACKUP_KEEP` | `14` | daily database backups to keep in `data/backups` |
| `WORKIFY_TRUST_PROXY` | `1` | reverse proxies in front of the app that append to `X-Forwarded-For` |
| `WORKIFY_MAX_JOBS` / `WORKIFY_MAX_QUEUE` | `4` / `20` | conversions running at once / allowed to wait |
| `WORKIFY_PY_WORKERS` | `2` | warm Python worker processes |
| `WORKIFY_TESSDATA` | `data/tessdata` or system | folder with Tesseract `*.traineddata` files |
| `NEXT_PUBLIC_GOOGLE_*`, `NEXT_PUBLIC_DROPBOX_APP_KEY` | — | Google Drive / Dropbox buttons (build time) |

## Becoming admin

Sign up, verify your email, and add that email to `WORKIFY_ADMIN_EMAILS`
(restart the app). Admins can make other users admin from `/admin/users`.
Without SMTP the verification email is not sent; read the link from the outbox
as described in [DEPLOY.md](DEPLOY.md#first-admin-without-smtp).

## Deploying safely

1. **Put it behind a reverse proxy with HTTPS** (Caddy, nginx or a CDN such as
   Cloudflare). Run Next on `127.0.0.1` so only the proxy can reach it, and set
   `WORKIFY_TRUST_PROXY` to the number of proxies in front of the app so
   per-client rate limits use the real client IP. Without a proxy, per-client
   limits can be evaded by forging `X-Forwarded-For`; the global limits and the
   job queue still protect the server.
2. **CDN**: all marketing and tool pages are prerendered and served with
   `s-maxage`; `/_next/static/*` files are immutable. A CDN in front caches them
   with no extra configuration. `/api/*`, `/account`, `/admin`, `/login`,
   `/signup` and `/sign/*` are per-user and are not cached.
3. **Firewall**: expose only ports 80/443 of the proxy. Never expose the Next
   port, databases or other services directly.
4. **Data**: `data/` holds the SQLite database, signature files, the signing
   certificate, `secret.key` and backups. Keep it on a persistent disk, out of
   the web root (it is, by default), and copy it off the server
   ([DEPLOY.md](DEPLOY.md#backups)).

## Security measures in the app

- Per-client + global rate limits, a bounded job queue, upload size and count limits
  checked before the body is read; API keys are rate limited separately.
- CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS;
  no `X-Powered-By`.
- Passwords hashed with scrypt; constant-time comparison; equal-time failures for unknown
  emails; login limited per IP and per email; sessions stored as SHA-256 hashes in
  http-only, SameSite=Lax cookies; changing the password signs out other devices.
- Password-reset and verification links and API keys are stored only as SHA-256 hashes;
  signing links are looked up by hash and kept encrypted (AES-256-GCM) for reminders.
- Admin pages and actions check the admin role on the server; admins need a verified email.
- Safe redirects after login (no open redirect).
- Uploaded files live in random, unguessable job folders, are never served from the
  project folder, and are deleted after one hour (immediately on failure).
- HTML→PDF blocks private/loopback/link-local addresses, also on redirects. Webhooks
  go only to public addresses, do not follow redirects and are signed with HMAC-SHA256.
- PDF passwords are passed to qpdf through a temporary args file, not the process list.
- Ghostscript runs with `-dSAFER`; Python runs isolated (`-I`).
- All coordinates, sizes and texts from the editors are validated and clamped server-side.
