# Google Drive and Dropbox import (optional)

Workify can let users pick files from Google Drive or Dropbox. Both are **free**
and the buttons stay **hidden until you add the keys** below to `.env.local`.

Why the risk is low:

- Google uses the `drive.file` scope: Workify can read only the files the user
  picks, never the rest of their Drive.
- Dropbox Chooser gives a one-time link to the chosen file only.
- These keys are meant to be public (they are shipped to the browser). Lock them
  to your website's address as described below so nobody else can use them.

After adding keys, restart the dev server (`npm run dev`).

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
6. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000` (and later your real domain, e.g. `https://workify.example.com`).
   - **Create** and copy the **Client ID**.
7. **Create credentials → API key** → copy it → **Edit API key**:
   - Application restrictions: **Websites** → add `http://localhost:3000/*` (and your domain).
   - API restrictions: **Restrict key** → choose **Google Picker API**.

## 2. Dropbox (Chooser)

1. Go to <https://www.dropbox.com/developers/apps> → **Create app**.
2. Choose **Scoped access** → **App folder** or **Full Dropbox** (Chooser works with either) → name it → **Create app**.
3. On the app's **Settings** tab, under **Chooser / Saver / Embedder domains**, add `localhost` (and later your domain).
4. Copy the **App key** (not the secret — Workify never needs the secret).

## 3. Add the keys

Create `workify/.env.local` (it is git-ignored):

```env
NEXT_PUBLIC_GOOGLE_API_KEY=your-api-key
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_APP_ID=your-project-number
NEXT_PUBLIC_DROPBOX_APP_KEY=your-dropbox-app-key
```

You can add just one of the two services; only its button will appear.

## Turning it off

Delete the lines from `.env.local` and restart. The buttons disappear.
