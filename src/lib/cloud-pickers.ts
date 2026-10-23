"use client";

// Optional cloud pickers. Each one is enabled only when its public keys are set
// in .env.local (see CLOUD_SETUP.md); otherwise its button is hidden.

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID;
const DROPBOX_APP_KEY = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY;

export const googleEnabled = Boolean(GOOGLE_API_KEY && GOOGLE_CLIENT_ID && GOOGLE_APP_ID);
export const dropboxEnabled = Boolean(DROPBOX_APP_KEY);

function loadScript(src: string, attrs: Record<string, string> = {}) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

type DropboxFile = { name: string; link: string };
type DropboxApi = {
  choose: (o: {
    linkType: "direct";
    multiselect: boolean;
    extensions: string[];
    success: (files: DropboxFile[]) => void;
    cancel?: () => void;
  }) => void;
};

/** Opens the Dropbox Chooser; resolves with downloaded Files (empty if cancelled). */
export async function pickFromDropbox(multiple: boolean, extensions: string[]): Promise<File[]> {
  await loadScript("https://www.dropbox.com/static/api/2/dropins.js", {
    id: "dropboxjs",
    "data-app-key": DROPBOX_APP_KEY!,
  });
  const Dropbox = (window as unknown as { Dropbox: DropboxApi }).Dropbox;
  const picked = await new Promise<DropboxFile[]>((resolve) =>
    Dropbox.choose({ linkType: "direct", multiselect: multiple, extensions, success: resolve, cancel: () => resolve([]) }),
  );
  return Promise.all(
    picked.map(async (f) => new File([await (await fetch(f.link)).blob()], f.name)),
  );
}

type GoogleNs = {
  accounts: {
    oauth2: {
      initTokenClient: (o: {
        client_id: string;
        scope: string;
        callback: (r: { access_token?: string; error?: string }) => void;
      }) => { requestAccessToken: () => void };
    };
  };
  picker: {
    PickerBuilder: new () => GooglePickerBuilder;
    DocsView: new (viewId?: string) => { setMimeTypes: (m: string) => unknown };
    ViewId: { DOCS: string };
    Feature: { MULTISELECT_ENABLED: string };
    Action: { PICKED: string; CANCEL: string };
  };
};
type GooglePickerBuilder = {
  setAppId: (id: string) => GooglePickerBuilder;
  setOAuthToken: (t: string) => GooglePickerBuilder;
  setDeveloperKey: (k: string) => GooglePickerBuilder;
  addView: (v: unknown) => GooglePickerBuilder;
  enableFeature: (f: string) => GooglePickerBuilder;
  setCallback: (cb: (d: { action: string; docs?: { id: string; name: string }[] }) => void) => GooglePickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
};

type GoogleWindow = { gapi: { load: (n: string, cb: () => void) => void }; google: GoogleNs };

/** Loads Google's scripts and asks for a token with the narrow drive.file scope (only files Workify opens or creates). */
async function googleToken(withPicker: boolean): Promise<{ google: GoogleNs; token: string }> {
  await Promise.all([
    withPicker ? loadScript("https://apis.google.com/js/api.js") : null,
    loadScript("https://accounts.google.com/gsi/client"),
  ]);
  const w = window as unknown as GoogleWindow;
  if (withPicker) await new Promise<void>((r) => w.gapi.load("picker", r));
  const google = w.google;
  const token = await new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID!,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error("Google sign-in failed."))),
    });
    client.requestAccessToken();
  });
  return { google, token };
}

/** Uploads a result file to the user's Google Drive. Resolves with a link to it. */
export async function saveToGoogleDrive(file: Blob, name: string): Promise<string | null> {
  const { token } = await googleToken(false);
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify({ name })], { type: "application/json" }));
  body.append("file", file, name);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error("Could not save the file to Google Drive.");
  return ((await res.json()) as { webViewLink?: string }).webViewLink ?? null;
}

type DropboxSaver = {
  save: (url: string, name: string, o: { success: () => void; cancel: () => void; error: (e: string) => void }) => void;
};

/**
 * Opens the Dropbox Saver. Dropbox downloads the file from `absoluteUrl`
 * itself, so this works only when the site is reachable from the internet.
 */
export async function saveToDropbox(absoluteUrl: string, name: string): Promise<boolean> {
  await loadScript("https://www.dropbox.com/static/api/2/dropins.js", { id: "dropboxjs", "data-app-key": DROPBOX_APP_KEY! });
  const Dropbox = (window as unknown as { Dropbox: DropboxSaver }).Dropbox;
  return new Promise((resolve, reject) =>
    Dropbox.save(absoluteUrl, name, {
      success: () => resolve(true),
      cancel: () => resolve(false),
      error: () => reject(new Error("Could not save the file to Dropbox.")),
    }),
  );
}

/** Opens the Google Drive Picker with the narrow drive.file scope (only picked files). */
export async function pickFromGoogleDrive(multiple: boolean, mimeTypes: string): Promise<File[]> {
  const { google, token } = await googleToken(true);

  const docs = await new Promise<{ id: string; name: string }[]>((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
    view.setMimeTypes(mimeTypes);
    let builder = new google.picker.PickerBuilder()
      .setAppId(GOOGLE_APP_ID!)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_API_KEY!)
      .addView(view)
      .setCallback((d) => {
        if (d.action === google.picker.Action.PICKED) resolve(d.docs ?? []);
        else if (d.action === google.picker.Action.CANCEL) resolve([]);
      });
    if (multiple) builder = builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
    builder.build().setVisible(true);
  });

  return Promise.all(
    docs.map(async (d) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(d.id)}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not download the file from Google Drive.");
      return new File([await res.blob()], d.name);
    }),
  );
}
