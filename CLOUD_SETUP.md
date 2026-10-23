# Google Drive and Dropbox (optional)

Workify can let users open files from Google Drive or Dropbox and save results
back to them. Both are **free** and the buttons stay **hidden until you add the
keys** below.

Why the risk is low:

- Google uses the `drive.file` scope: Workify can reach only the files the user
  picks and the files it saves for them, never the rest of their Drive.
- Dropbox Chooser gives a one-time link to the chosen file only; Dropbox Saver
  only adds the result file the user asked to save.
- These keys are meant to be public (they are shipped to the browser). Lock them
  to your website's address as described below so nobody else can use them.

**Save to Dropbox** works only on a site reachable from the internet: Dropbox
downloads the result from your server itself, so it fails on `localhost`.

---

## 1. Google Drive (Google Picker API)

1. Go to <https://console.cloud.google.com/> and sign in.
2. Top bar → project picker → **New project** → name it `Workify` → **Create**.
3. Note the **Project number** on the project dashboard. This is your App ID.
4. **APIs & Services → Library** → enable **Google Picker API** and **Google Drive API**.
5. **APIs & Services → OAuth consent screen**:
   - User type **External** → **Create**.
   - App name `Workify`, your support email, developer email → **Save and continue**.
   - Scopes: **Add** `.../auth/drive.file` → **Save and continue**.
   - Test users: add your own Google account (needed while the app is in "Testing").
     Publish the app when other people should be able to use the button.
6. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000` (and later your real domain, e.g. `https://workify.example.com`).
   - **Create** and copy the **Client ID**.
7. **Create credentials → API key** → copy it → **Edit API key**:
   - Application restrictions: **Websites** → add `http://localhost:3000/*` (and your domain).
   - API restrictions: **Restrict key** → choose **Google Picker API**.

## 2. Dropbox (Chooser and Saver)

1. Go to <https://www.dropbox.com/developers/apps> → **Create app**.
2. Choose **Scoped access** → **App folder** or **Full Dropbox** (Chooser and Saver work with either) → name it → **Create app**.
3. On the app's **Settings** tab, under **Chooser / Saver / Embedder domains**, add `localhost` (and later your domain).
4. Copy the **App key** (not the secret — Workify never needs the secret).

## 3. Add the keys

**Development:** create `workify/.env.local` (it is git-ignored) and restart
`npm run dev`:

```env
NEXT_PUBLIC_GOOGLE_API_KEY=your-api-key
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_APP_ID=your-project-number
NEXT_PUBLIC_DROPBOX_APP_KEY=your-dropbox-app-key
```

**Production:** these are build-time values, so rebuild after setting them:

- `docker compose`: put the same lines in `.env` and run `docker compose up -d --build`.
- `docker build`: pass each one as `--build-arg NAME=value`.
- Render / Railway: add them as environment variables and redeploy.

You can add just one of the two services; only its buttons will appear.

## Turning it off

Delete the lines (and rebuild in production). The buttons disappear.
