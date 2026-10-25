# Deploying Workify

Workify needs real server software (LibreOffice, Ghostscript, qpdf, Tesseract,
Python, Chromium), so it **cannot run on Vercel or Netlify**. The included
`Dockerfile` packages all of it; any host that runs Docker images works.

**Memory:** plan for **2 GB RAM** (LibreOffice + Chromium + 2 Python workers).
512 MB "free" tiers will run out of memory on conversions.

**Cost:** Workify itself is free and has no paid features. For hosting, Oracle
Cloud "Always Free" (Option O) or a computer you already own (Option B) cost
nothing; Render, Railway and rented VPSs are paid. Free tiers of companies can
change at any time; software you host yourself is the only option that stays
free for good.

After the app is up, go through [Email](#email-smtp), [First admin](#first-admin)
and [Backups](#backups).

---

## Option O — Oracle Cloud "Always Free" (free forever, 4 CPU / 24 GB RAM)

1. Sign up at <https://www.oracle.com/cloud/free/> (a card is needed only for
   verification). Pick a home region near you (it cannot be changed later).
2. **Compute → Instances → Create instance**
   - Image: **Canonical Ubuntu 24.04** · Shape: **Ampere → VM.Standard.A1.Flex**, 4 OCPU, 24 GB
   - Networking: create a new VCN with a **public subnet** and **assign a public IPv4 address**
   - SSH keys: **Save private key** (keep it safe) · Boot volume: 100 GB
   - "Out of capacity"? Try another availability domain or retry later.
3. **Networking → Virtual cloud networks →** your VCN → subnet → **Default Security List →
   Add Ingress Rules**: source `0.0.0.0/0`, TCP, destination port **80**; again for **443**.
4. Free domain: <https://www.duckdns.org> → sign in → add a subdomain (e.g. `workify`)
   → set its IP to the VM's public IP.
5. Connect and install (Windows PowerShell):
   ```powershell
   ssh -i C:\path\to\ssh-key.key ubuntu@<PUBLIC_IP>
   ```
   then on the server:
   ```bash
   git clone https://github.com/Krishnadevelopedthis/Workify.git && cd Workify
   bash deploy/oracle-setup.sh workify.duckdns.org
   ```
6. Open `https://workify.duckdns.org`.
7. Add your settings (email, admin, secret) to `~/Workify/.env` — start from
   [.env.example](.env.example) — and apply them with
   `sudo docker compose up -d`. Update later with
   `cd Workify && git pull && sudo docker compose pull caddy && sudo docker compose build --pull && sudo docker compose up -d`
   (`--pull` also fetches the newest Node.js base image and Debian security updates).

Oracle may reclaim Always Free VMs that stay almost completely idle for a week;
upgrading the account to Pay-As-You-Go keeps the free resources free and avoids that.

## Option R — Render (paid plan, uses `render.yaml`)

1. <https://dashboard.render.com> → sign in with GitHub.
2. **New → Blueprint →** select the `Workify` repo → Render reads `render.yaml`.
3. When asked, set `NEXT_PUBLIC_SITE_URL` to `https://workify.onrender.com`
   (or the URL Render shows / your own domain), `WORKIFY_ADMIN_EMAILS` to your
   email, and the `SMTP_*` / `MAIL_FROM` values (see [Email](#email-smtp)),
   then **Apply**. `WORKIFY_SECRET` is generated for you.
4. It creates a **Standard** web service (2 GB RAM) with a 1 GB disk at
   `/app/data`. Pushes to `main` redeploy automatically. Render checks
   `/api/health`.

Notes: the free and Starter plans (512 MB) are too small; services with a disk
run as a single instance (fine for SQLite). `NEXT_PUBLIC_*` values are baked
into the build: after changing them, trigger a new deploy. Other variables can
be changed under **Environment** at any time. After deploying, try HTML→PDF once:
if it fails with a sandbox error, read [Chromium sandbox](#chromium-sandbox).
Render rebuilds only on a push, so redeploy manually after Node.js or Chromium
security releases (**Manual Deploy → Clear build cache & deploy**).

## Option A — Railway (paid after the trial, deploys from GitHub)

1. Go to <https://railway.com>, sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** choose `Workify`.
   Railway finds the `Dockerfile` automatically.
3. Open the service → **Variables** → add
   - `NEXT_PUBLIC_SITE_URL` = `https://<your-app>.up.railway.app` (or your domain)
   - `WORKIFY_TRUST_PROXY` = `1`
   - `WORKIFY_SECRET` = a long random string (e.g. `openssl rand -base64 32`)
   - `WORKIFY_ADMIN_EMAILS`, `SMTP_*`, `MAIL_FROM` as described below
4. **Settings → Volumes → New volume**, mount path **`/app/data`**
   (keeps accounts, workflows, signature requests and backups across deploys).
5. **Settings → Networking → Generate domain** (or add your own domain).
6. Every push to the default branch redeploys automatically.

## Option B — Your own server or VPS

Any Ubuntu machine with a public IP: a spare PC at home (free) or a rented VPS
(Hetzner, DigitalOcean…):

```bash
# on the server
curl -fsSL https://get.docker.com | sh
git clone https://github.com/<you>/Workify.git && cd Workify
cp .env.example .env && chmod 600 .env
nano .env        # set DOMAIN (DNS A record -> server IP), WORKIFY_SECRET, SMTP, admin email
docker compose pull caddy && docker compose build --pull && docker compose up -d
```

Caddy gets a free HTTPS certificate automatically. Update later with
`git pull && docker compose pull caddy && docker compose build --pull && docker compose up -d`. In `.env`, put values that contain
`$` in single quotes (`SMTP_PASS='pa$$word'`), otherwise Compose expands them.

Firewall on the server: allow only 22 (SSH), 80 and 443.

## Option C — Any Docker host (Fly.io, Koyeb…)

```bash
docker build --pull -t workify --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain .
docker run -d -p 3000:3000 -v workify-data:/app/data --env-file workify.env \
  --security-opt seccomp=deploy/chrome-seccomp.json workify
```

`workify.env` holds the server variables (see [below](#environment-variables)),
one `NAME=value` per line; `docker run` reads the values literally, so do not
quote them. Mount a persistent disk at `/app/data`, expose port `3000`, choose an instance
with at least 2 GB RAM, and point the host's health check at `/api/health`.

**Always put a reverse proxy (the host's load balancer, Caddy, nginx) in front of
port 3000 that overwrites `X-Forwarded-For`.** Never publish the port directly to
the internet: rate limits are keyed on that header, so without such a proxy every
client could pick its own key and the limits would not apply.

Rebuild regularly (at least after every Node.js or Chromium security release) with
`--pull`, so the image picks up the new base image and Debian security updates.

---

## Environment variables

All are optional. Server values are read at start-up: restart the app after a
change. `NEXT_PUBLIC_*` values are compiled into the build: rebuild after a
change (in Docker they are `--build-arg`s; `docker-compose.yml` passes them).
A template with every variable is in [.env.example](.env.example).

### Site

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | **Set in production.** The public URL, used in emailed links (verification, password reset, signing invitations), canonical links, the sitemap, social previews and the API docs. Build time. |
| `WORKIFY_SECRET` | random value stored in `data/secret.key` | **Recommended.** Server secret that encrypts signing links (so reminders can re-send them) and derives each user's webhook signing secret. Use a long random string (`openssl rand -base64 32`). Changing it breaks links already emailed and changes every webhook secret. If you leave it unset, keep `data/secret.key` with your backups. |

### Accounts and admin

| Variable | Default | Purpose |
|---|---|---|
| `WORKIFY_ADMIN_EMAILS` | — | Comma-separated emails that are admins, e.g. `me@example.com,ops@example.com`. The account must exist and its email must be verified. Admins also receive an hourly error digest by email. |

### Email settings

Without `SMTP_HOST`, nothing is sent: every email is kept in the outbox, which
admins can read at `/admin/emails`.

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_HOST` | — | SMTP server; setting it turns email on. |
| `SMTP_PORT` | `587` | `587` (STARTTLS) or `465` (TLS). |
| `SMTP_SECURE` | `true` when the port is `465` | Force TLS on (`true`) or off (`false`). |
| `SMTP_USER` | — | SMTP login; leave empty for a server that needs no login. |
| `SMTP_PASS` | — | SMTP password or app password. Secret. |
| `MAIL_FROM` | `Workify <no-reply@<site host>>` | Sender, e.g. `Workify <you@gmail.com>`. Most providers require an address you have verified with them. |

### Digital signatures

| Variable | Default | Purpose |
|---|---|---|
| `WORKIFY_SIGN_P12` | — (a self-signed certificate is created in `data/signing/`) | Path to your own `.p12`/`.pfx` certificate for the PKCS#7 seal on completed signature requests. In Docker, put it in the data volume, e.g. `/app/data/certs/seal.p12`. |
| `WORKIFY_SIGN_P12_PASSWORD` | empty | Password of that file. Secret. |

The self-signed seal still proves that a document was not changed after signing,
but PDF readers show its signer as "unknown" until a reader trusts the
certificate. `/admin/system` shows which certificate is in use.

### Backup settings

| Variable | Default | Purpose |
|---|---|---|
| `WORKIFY_BACKUP_KEEP` | `14` | Number of daily database backups kept in `data/backups`. |

### Proxy, limits and performance

| Variable | Default | Purpose |
|---|---|---|
| `WORKIFY_TRUST_PROXY` | `1` | Number of reverse proxies in front of the app that append to `X-Forwarded-For`. Used for per-client rate limits. Keep `1` with the included Caddy setup. With Cloudflare in front of Caddy, set `2` **only after** giving Caddy Cloudflare's address ranges with `trusted_proxies` (see the comment in the [Caddyfile](Caddyfile)); without that, Caddy replaces the header and every visitor would share a Cloudflare address. The app logs a warning when the header has fewer entries than this value. |
| `WORKIFY_MAX_JOBS` | `4` | Heavy conversions running at once. Raise on bigger servers. |
| `WORKIFY_MAX_QUEUE` | `20` | Conversions allowed to wait before "busy" is returned. |
| `WORKIFY_PROCESS_GLOBAL_LIMIT` | `6000` | Tool runs allowed site-wide per 10 minutes (each visitor is also limited to 40). Only stops floods; the job queue protects the server. |
| `WORKIFY_PY_WORKERS` | `2` | Warm Python worker processes (each uses memory). |
| `WORKIFY_PY_MEMORY_MB` | `1536` | Memory each Python worker may use beyond its libraries (Linux); a file that needs more fails cleanly instead of exhausting the server. `0` turns the cap off. |
| `WORKIFY_UPLOAD_BUDGET_MB` | a quarter of the memory, at most 1024 | Total size of uploads being received at once; further uploads get "busy, try again in a minute". |
| `WORKIFY_MEM_LIMIT` | `3g` | `docker-compose.yml` only: memory cap of the app container. Raise it on big servers (e.g. `8g` on Oracle A1). |

### PDF engines

Found automatically in their default folders (Windows and Debian/Ubuntu paths).
Set these only if an engine lives elsewhere; `/admin/system` and
`/api/health?engines=1` show what was found.

| Variable | Purpose |
|---|---|
| `WORKIFY_GS` | Ghostscript executable (`gswin64c.exe` / `gs`). |
| `WORKIFY_QPDF` | qpdf executable. |
| `WORKIFY_SOFFICE` | LibreOffice `soffice` executable. |
| `WORKIFY_TESSERACT` | Tesseract executable. |
| `WORKIFY_TESSDATA` | Folder with `*.traineddata` OCR models (and the `configs` folder). Default: `data/tessdata` (filled by `npm run ocr-languages`), then the system folder. |
| `WORKIFY_PYTHON` | Python with the packages from `py/requirements.txt`. Default: `py/.venv`. |
| `WORKIFY_CHROME` | Chrome, Edge or Chromium for HTML→PDF. The Docker image sets `/usr/local/bin/workify-chromium`, a wrapper that starts `/usr/bin/chromium` with an empty environment (no app secrets). |
| `WORKIFY_CHROME_NO_SANDBOX` | Not set by the Docker image: Chromium keeps its sandbox, because it renders pages chosen by anyone. `1` starts it with `--no-sandbox`. **Last resort only**, on hosts that cannot allow user namespaces (see [Chromium sandbox](#chromium-sandbox)); it turns off renderer isolation, so a browser exploit would run with the app's own rights. |

### Google Drive and Dropbox (build time)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_GOOGLE_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_APP_ID` | "Google Drive" buttons to open files and save results. All three are needed. |
| `NEXT_PUBLIC_DROPBOX_APP_KEY` | "Dropbox" buttons to open files and save results. |

How to get them: [CLOUD_SETUP.md](CLOUD_SETUP.md). Without them the buttons are hidden.

### Set by the platform

| Variable | Purpose |
|---|---|
| `PORT` | Port the Docker image listens on (default `3000`). |
| `NODE_ENV` | `production` under `next start`; session cookies are then marked `Secure` (HTTPS only). |

---

## Email (SMTP)

Email is used for verification, password reset, signing invitations,
reminders and "completed" notices, and the admin error digest. Any SMTP
server works. Free choices:

- **Your own mail server** (Postfix, or a bundle such as Mailcow or
  Mail-in-a-Box): open source, free for good. It needs SPF, DKIM and a reverse
  DNS record to reach inboxes, and many clouds block outgoing port 25 by
  default (Oracle Cloud among them).
- **Gmail** (free account): turn on 2-Step Verification, then create an
  **App password** at <https://myaccount.google.com/apppasswords>.
  `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=you@gmail.com`,
  `SMTP_PASS=<16-letter app password>`, `MAIL_FROM=Workify <you@gmail.com>`.
  Gmail limits how many emails a day an account may send.
- **Brevo** free plan: verify a sender, then under **SMTP & API** copy the SMTP
  login and create an SMTP key. `SMTP_HOST=smtp-relay.brevo.com`,
  `SMTP_PORT=587`, `SMTP_USER=<SMTP login>`, `SMTP_PASS=<SMTP key>`.

Company free plans and their limits can change. After setting the variables,
restart and use **Send test email** on `/admin/system`. Failed emails are
retried for a while and listed on `/admin/emails`.

## First admin

1. Sign up on your site with the email you want to use.
2. Verify it with the link in the verification email.
3. Set `WORKIFY_ADMIN_EMAILS=that@email` and restart. **Admin** appears in the
   account menu; the panel is at `/admin`.
4. From `/admin/users` you can make other verified users admin (or remove them
   from `WORKIFY_ADMIN_EMAILS` again).

### First admin without SMTP

Before email is set up, the verification email stays in the outbox. Print the
newest outbox email (it contains the link) on the server:

```bash
sudo docker compose exec app node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/workify.db", { readOnly: true });
console.log(db.prepare("SELECT to_email, subject, text FROM outbox ORDER BY id DESC LIMIT 1").get());'
```

(Without Docker, run the same `node -e …` in the project folder. On Render use
the service's **Shell** tab.) Open the link, then continue with step 3.

## Admin panel

`/admin` shows alerts (SMTP missing, failed emails, recent errors, unanswered
contact messages, low disk space) and has pages for users (make admin, mark the
email verified, disable, delete), signature requests, the email outbox, the error log, contact messages,
the Premium waitlist, backups and a system check (engines, SMTP test,
configuration, signing certificate).

## Backups

The app makes a consistent copy of the database (`VACUUM INTO`) once a day into
`data/backups/workify-YYYYMMDD-HHMMSS.db` and keeps the newest
`WORKIFY_BACKUP_KEEP` (14). Admins can make one now and download any of them at
`/admin/backups`. Background jobs (backups, reminders, email retries, expiry)
start with the first request after a start; the Docker health check makes that
request for you.

A copy on the same disk does not survive a lost server. Copy these off the
server every day:

| Path in `data/` | What |
|---|---|
| `backups/` | database copies (accounts, workflows, requests, API keys) |
| `signatures/` | uploaded and signed PDFs of signature requests |
| `signing/` | the self-signed seal certificate |
| `secret.key` | server secret, if `WORKIFY_SECRET` is not set |

Do not copy the live `workify.db*` files; use the files in `backups/`.

### Off-site copy with rclone

[rclone](https://rclone.org) is free and open source. Its destination can be
another computer of yours over SFTP (free for good) or a cloud drive such as a
free Google Drive account.

```bash
# on the server
sudo apt-get install -y rclone
sudo rclone config            # create a remote, e.g. "offsite" (type sftp or drive)
sudo crontab -e               # add the line below
```

```cron
30 3 * * * rclone sync "$(docker volume inspect -f '{{.Mountpoint}}' workify_workify-data)" offsite:workify-backup --exclude "workify.db*" --exclude "tessdata/**" --log-file /var/log/workify-backup.log
```

`workify_workify-data` is the volume `docker compose` creates when the folder
is named `Workify`; check with `sudo docker volume ls`. Without Docker, use the
project's `data` folder as the source.

**Restore:** stop the app, copy the chosen `backups/workify-….db` to
`data/workify.db`, delete `data/workify.db-wal` and `data/workify.db-shm` if
present, put back `signatures/`, `signing/` and `secret.key`, start the app.

## Chromium sandbox

HTML→PDF opens pages chosen by anyone, so Chromium runs with its sandbox, and
LibreOffice runs without network access. Both need Linux user namespaces, which
Docker's default seccomp profile blocks. `docker-compose.yml` therefore starts
the app with [deploy/chrome-seccomp.json](deploy/chrome-seccomp.json) (Docker's
default profile plus `clone`, `unshare` and `setns`); with plain `docker run`,
pass `--security-opt seccomp=deploy/chrome-seccomp.json` (run the command from
the repository folder). Check it on the server:

```bash
docker compose exec -u node app /usr/local/bin/workify-chromium --headless --dump-dom about:blank
```

It should print `<html><head></head><body></body></html>`. If it says
`No usable sandbox!`:

- the profile is not applied (check `security_opt`, then
  `docker compose up -d --force-recreate`), or
- the host restricts user namespaces with AppArmor (some Ubuntu 23.10+ hosts
  with `kernel.apparmor_restrict_unprivileged_userns=1`). Add
  `apparmor=unconfined` under `security_opt`, or allow `userns` in an AppArmor
  profile for the container.

Hosts that cannot allow user namespaces at all (some PaaS): HTML→PDF then
fails. Only there, and knowing that it turns off renderer isolation, set
`WORKIFY_CHROME_NO_SANDBOX=1`; better, run that host without secrets in the
environment, or use a host where the check above passes. LibreOffice keeps
working without namespaces; the error log then notes that it runs without
network isolation.

## Health checks

`GET /api/health` returns `200 {"status":"ok","database":true}` while the
database answers and `503` otherwise; `/api/health?engines=1` also lists the
PDF engines found. Point any uptime monitor at it, for example
[Uptime Kuma](https://github.com/louislam/uptime-kuma) (open source, self-hosted).

## Features that depend on the deployment

- **Signature requests** need email for invitations and reminders. Without
  SMTP, senders can still copy each signer's link from the request page.
- **Developer API** (`/api/v1`, docs at `/developers`): users create API keys
  and webhooks on their account's Developer page. Links in API responses and
  webhooks use `NEXT_PUBLIC_SITE_URL`. Zapier ("Webhooks by Zapier") and Make
  ("HTTP" and "Webhooks" modules) call the same endpoints.
- **Install as an app (PWA)** and **Dropbox save** need the site on public
  HTTPS; Dropbox downloads the file from your server itself.
- **Languages**: all 11 are built in; nothing to configure.

Never commit `.env` files; set secrets in the host's dashboard or in a `.env`
file readable only by you (`chmod 600 .env`).
