# Workify production image: Next.js app + every PDF engine it uses.
# Build:  docker build -t workify --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain .
# Run:    docker run -p 3000:3000 -v workify-data:/app/data workify

# Debian 13 (trixie): its Ghostscript 10.05 works with ocrmypdf. Bookworm ships
# 10.0.0, which ocrmypdf refuses because it corrupts PDFs that contain text.
FROM node:24-trixie-slim

ENV DEBIAN_FRONTEND=noninteractive
# PDF engines, OCR languages, office suite, headless browser and fonts.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates python3 python3-venv \
      ghostscript qpdf \
      libreoffice-writer libreoffice-calc libreoffice-impress \
      chromium fonts-noto-core fonts-noto-cjk fonts-dejavu-core \
      tesseract-ocr \
      tesseract-ocr-hin tesseract-ocr-mar tesseract-ocr-ben tesseract-ocr-guj tesseract-ocr-pan \
      tesseract-ocr-tam tesseract-ocr-tel tesseract-ocr-kan tesseract-ocr-mal tesseract-ocr-urd \
      tesseract-ocr-ori tesseract-ocr-asm tesseract-ocr-nep tesseract-ocr-san \
      tesseract-ocr-spa tesseract-ocr-fra tesseract-ocr-deu tesseract-ocr-ita tesseract-ocr-por \
      tesseract-ocr-nld tesseract-ocr-rus tesseract-ocr-ukr tesseract-ocr-pol tesseract-ocr-tur \
      tesseract-ocr-ara tesseract-ocr-fas tesseract-ocr-chi-sim tesseract-ocr-chi-tra \
      tesseract-ocr-jpn tesseract-ocr-kor tesseract-ocr-vie tesseract-ocr-ind tesseract-ocr-tha \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN chown node:node /app
USER node

# Python converters in their own virtualenv (versions match the tested setup).
COPY --chown=node:node py/requirements.txt py/requirements.txt
RUN python3 -m venv py/.venv \
 && py/.venv/bin/pip install --no-cache-dir --timeout 120 --retries 10 -r py/requirements.txt

# Node dependencies (postinstall copies the pdf.js worker into public/). The npm
# cache survives between builds, so a retry after a network failure only fetches
# what is still missing.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts ./scripts
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci --prefer-offline --no-audit --no-fund --fetch-retries=6 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000

# Public values are baked into the build; pass them with --build-arg.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_GOOGLE_API_KEY=
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_GOOGLE_APP_ID=
ARG NEXT_PUBLIC_DROPBOX_APP_KEY=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_GOOGLE_API_KEY=$NEXT_PUBLIC_GOOGLE_API_KEY \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_GOOGLE_APP_ID=$NEXT_PUBLIC_GOOGLE_APP_ID \
    NEXT_PUBLIC_DROPBOX_APP_KEY=$NEXT_PUBLIC_DROPBOX_APP_KEY \
    NEXT_TELEMETRY_DISABLED=1

COPY --chown=node:node . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

ENV NODE_ENV=production \
    PORT=3000 \
    HOME=/home/node \
    WORKIFY_TRUST_PROXY=1 \
    WORKIFY_CHROME=/usr/bin/chromium \
    WORKIFY_CHROME_NO_SANDBOX=1

# SQLite database and signature requests live here; mount a volume to keep them.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Hosted disks (Render, Railway, Fly) are often mounted owned by root. Start as
# root only to hand /app/data to the "node" user, then run the app as "node".
USER root
CMD ["sh", "-c", "chown -R node:node /app/data && exec setpriv --reuid=node --regid=node --init-groups node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
