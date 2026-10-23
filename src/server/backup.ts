import "server-only";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, db } from "./db";

// Database backups: a consistent copy of data/workify.db made with VACUUM INTO,
// once a day automatically and on demand from the admin panel. Signature
// files live in data/signatures; back up the whole data/ volume for those.

export const BACKUP_DIR = path.join(DATA_DIR, "backups");
const NAME_RE = /^workify-\d{8}-\d{6}\.db$/;
const keep = () => Math.max(1, Number(process.env.WORKIFY_BACKUP_KEEP) || 14);

export type Backup = { name: string; size: number; at: number };

export async function createBackup(): Promise<Backup> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const name = `workify-${stamp}.db`;
  const file = path.join(BACKUP_DIR, name);
  await rm(file, { force: true }); // VACUUM INTO refuses to overwrite
  db.backupTo(file);
  const backups = await listBackups();
  for (const old of backups.slice(keep())) await rm(path.join(BACKUP_DIR, old.name), { force: true });
  return { name, size: (await stat(file)).size, at: Date.now() };
}

/** Newest first. */
export async function listBackups(): Promise<Backup[]> {
  let names: string[];
  try {
    names = (await readdir(BACKUP_DIR)).filter((n) => NAME_RE.test(n));
  } catch {
    return [];
  }
  const list = await Promise.all(
    names.map(async (name) => {
      const s = await stat(path.join(BACKUP_DIR, name));
      return { name, size: s.size, at: s.mtimeMs };
    }),
  );
  return list.sort((a, b) => b.at - a.at);
}

export const backupPath = (name: string) => (NAME_RE.test(name) ? path.join(BACKUP_DIR, name) : null);

/** Makes a backup when the newest one is older than a day. */
export async function dailyBackup() {
  const [latest] = await listBackups();
  if (!latest || Date.now() - latest.at > 86_400_000) await createBackup();
}
