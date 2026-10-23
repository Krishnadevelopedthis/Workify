"use server";

import { requestT } from "@/i18n/request";
import { createApiKey, MAX_KEYS, apiKeysOf, revokeApiKey } from "@/server/api";
import { currentUser } from "@/server/auth";
import { addWebhook, removeWebhook, validateWebhookUrl, WEBHOOK_EVENTS, webhooksOf, type WebhookEvent } from "@/server/webhooks";

export type KeyState = { error?: string; key?: string };

export async function createKey(_prev: KeyState, form: FormData): Promise<KeyState> {
  const { t } = await requestT();
  const user = await currentUser();
  if (!user) return { error: t("Please log in again.") };
  if (!user.verified) return { error: t("Confirm your email address before creating API keys.") };
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || t("My key");
  if (apiKeysOf(user.id).length >= MAX_KEYS) return { error: t("You can have up to {max} API keys. Revoke one first.", { max: MAX_KEYS }) };
  return { key: createApiKey(user.id, name) };
}

export async function revokeKey(id: number) {
  const user = await currentUser();
  if (user) revokeApiKey(user.id, id);
}

export type HookState = { error?: string; secret?: string };

export async function createWebhook(_prev: HookState, form: FormData): Promise<HookState> {
  const { t } = await requestT();
  const user = await currentUser();
  if (!user) return { error: t("Please log in again.") };
  if (!user.verified) return { error: t("Confirm your email address before adding webhooks.") };
  if (webhooksOf(user.id).length >= 10) return { error: t("You can have up to {max} webhooks.", { max: 10 }) };
  const events = form.getAll("events").map(String).filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (!events.length) return { error: t("Choose at least one event.") };
  let url: string;
  try {
    url = await validateWebhookUrl(String(form.get("url") ?? ""));
  } catch {
    return { error: t("Use a public http or https address for the webhook.") };
  }
  return { secret: addWebhook(user.id, url, events) };
}

export async function deleteWebhook(id: number) {
  const user = await currentUser();
  if (user) removeWebhook(user.id, id);
}
