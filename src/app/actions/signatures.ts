"use server";

import { headers } from "next/headers";
import { requestT } from "@/i18n/request";
import { currentUser } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { SignInputError, parseSigners } from "@/server/sign-input";
import { cancel, getRequest, remind } from "@/server/sign-requests";

// Signature templates and the owner's actions on their requests (signed in).

export type TemplateData = {
  signers: { name: string; email: string | null }[];
  message: string;
  ordered: boolean;
  reminderDays: number;
};
export type SignTemplate = { id: number; name: string; data: TemplateData };

const MAX_TEMPLATES = 50;

export async function listTemplates(): Promise<SignTemplate[]> {
  const user = await currentUser();
  if (!user) return [];
  const rows = db
    .prepare("SELECT id, name, data FROM sign_templates WHERE user_id = ? ORDER BY name LIMIT 100")
    .all(user.id) as { id: number; name: string; data: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name, data: JSON.parse(r.data) as TemplateData }));
}

export async function saveTemplate(name: string, data: TemplateData): Promise<{ error?: string }> {
  const { t } = await requestT();
  const user = await currentUser();
  if (!user) return { error: t("Log in to save templates.") };
  const clean = name.trim().slice(0, 80);
  if (!clean) return { error: t("Give your template a name.") };
  let signers;
  try {
    signers = parseSigners(data?.signers);
  } catch (e) {
    return { error: e instanceof SignInputError ? t(e.template, e.vars) : t("The template could not be saved.") };
  }
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM sign_templates WHERE user_id = ?").get(user.id) as { n: number };
  if (n >= MAX_TEMPLATES) return { error: t("You can save up to {max} templates. Delete one first.", { max: MAX_TEMPLATES }) };
  const safe: TemplateData = {
    signers,
    message: String(data.message ?? "").slice(0, 1000),
    ordered: Boolean(data.ordered),
    reminderDays: [0, 1, 2, 3, 7].includes(Number(data.reminderDays)) ? Number(data.reminderDays) : 0,
  };
  db.prepare("INSERT INTO sign_templates (user_id, name, data, created_at) VALUES (?, ?, ?, ?)").run(user.id, clean, JSON.stringify(safe), Date.now());
  return {};
}

export async function deleteTemplate(id: number) {
  const user = await currentUser();
  if (user) db.prepare("DELETE FROM sign_templates WHERE id = ? AND user_id = ?").run(id, user.id);
}

async function ownRequest(id: string) {
  const user = await currentUser();
  const req = getRequest(id);
  return user && req && req.owner_id === user.id ? req : null;
}

export async function remindSigners(id: string): Promise<{ error?: string; reminded?: number }> {
  const { t } = await requestT();
  const req = await ownRequest(id);
  if (!req) return { error: t("Not found.") };
  const h = await headers();
  const limited = rateLimit("email", h, `manage:${id}`);
  if (limited) return { error: t(limited) };
  return { reminded: await remind(req, { ip: clientIp(h), userAgent: h.get("user-agent") }) };
}

export async function cancelRequest(id: string): Promise<{ error?: string }> {
  const { t } = await requestT();
  const req = await ownRequest(id);
  if (!req) return { error: t("Not found.") };
  const h = await headers();
  await cancel(req, { ip: clientIp(h), userAgent: h.get("user-agent") });
  return {};
}
