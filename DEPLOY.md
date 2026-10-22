# Deploying Workify

Workify needs real server software (LibreOffice, Ghostscript, qpdf, Tesseract,
Python, Chromium), so it **cannot run on Vercel or Netlify**. The included
`Dockerfile` packages all of it; any host that runs Docker images works.

**Memory:** plan for **2 GB RAM** (LibreOffice + Chromium + 2 Python workers).
512 MB "free" tiers will run out of memory on conversions.

---

## Option R — Render (uses `render.yaml`)

1. <https://dashboard.render.com> → sign in with GitHub.
2. **New → Blueprint →** select the `Workify` repo → Render reads `render.yaml`.
3. When asked, set `NEXT_PUBLIC_SITE_URL` to `https://workify.onrender.com`
   (or the URL Render shows / your own domain), then **Apply**.
4. It creates a **Standard** web service (2 GB RAM) with a 1 GB disk at
   `/app/data`. Pushes to `main` redeploy automatically.

Notes: the free and Starter plans (512 MB) are too small; services with a disk
run as a single instance (fine for SQLite). If you change
`NEXT_PUBLIC_SITE_URL` later, trigger a new deploy (it is baked into the build).

## Option A — Railway (deploys from GitHub)

1. Go to <https://railway.com>, sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** choose `Workify`.
   Railway finds the `Dockerfile` automatically.
3. Open the service → **Variables** → add
   - `NEXT_PUBLIC_SITE_URL` = `https://<your-app>.up.railway.app` (or your domain)
   - `WORKIFY_TRUST_PROXY` = `1`
4. **Settings → Volumes → New volume**, mount path **`/app/data`**
   (keeps accounts, workflows and signature requests across deploys).
5. **Settings → Networking → Generate domain** (or add your own domain).
6. Every push to the default branch redeploys automatically.

## Option B — Your own VPS (cheapest for 2–4 GB RAM)

Any Ubuntu server (Hetzner, DigitalOcean, AWS Lightsail…):

```bash
# on the server
curl -fsSL https://get.docker.com | sh
git clone https://github.com/<you>/Workify.git && cd Workify
echo "DOMAIN=workify.example.com" > .env      # your domain, DNS A record -> server IP
docker compose up -d --build
```

Caddy gets a free HTTPS certificate automatically. Update later with
`git pull && docker compose up -d --build`.

Firewall on the server: allow only 22 (SSH), 80 and 443.

## Option C — Any Docker host (Render, Fly.io, Koyeb…)

```bash
docker build -t workify --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain .
docker run -d -p 3000:3000 -v workify-data:/app/data workify
```

Mount a persistent disk at `/app/data`, expose port `3000`, and choose an
instance with at least 2 GB RAM.

---

## Optional settings

| Variable | When |
|---|---|
| `NEXT_PUBLIC_GOOGLE_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_APP_ID`, `NEXT_PUBLIC_DROPBOX_APP_KEY` | Google Drive / Dropbox import — see [CLOUD_SETUP.md](CLOUD_SETUP.md). These are build-time values: redeploy after setting them. |
| `WORKIFY_MAX_JOBS` / `WORKIFY_MAX_QUEUE` | Tune how many conversions run at once on bigger servers. |
| `WORKIFY_TRUST_PROXY` | Number of proxies in front of the app (`2` if you add Cloudflare in front of Caddy). |

Never commit `.env` files; set secrets in the host's dashboard.
