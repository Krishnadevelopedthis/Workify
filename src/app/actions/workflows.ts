"use server";

import { WORKFLOW_STEPS } from "@/lib/tools";
import { currentUser } from "@/server/auth";
import { db } from "@/server/db";

const MAX_WORKFLOWS = 100;

export type WorkflowStep = { tool: string; options: Record<string, unknown> };
export type SavedWorkflow = { id: number; name: string; steps: WorkflowStep[] };

function validSteps(steps: unknown): steps is WorkflowStep[] {
  return (
    Array.isArray(steps) &&
    steps.length > 0 &&
    steps.length <= 10 &&
    steps.every(
      (s) =>
        s && typeof s === "object" &&
        (WORKFLOW_STEPS as readonly string[]).includes((s as WorkflowStep).tool) &&
        typeof (s as WorkflowStep).options === "object",
    )
  );
}

/** Saved workflows of the signed-in user (empty when signed out). */
export async function listWorkflows(): Promise<SavedWorkflow[] | null> {
  const user = await currentUser();
  if (!user) return null;
  const rows = db
    .prepare("SELECT id, name, steps FROM workflows WHERE user_id = ? ORDER BY created_at DESC LIMIT 100")
    .all(user.id) as { id: number; name: string; steps: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name, steps: JSON.parse(r.steps) }));
}

export async function saveWorkflow(name: string, steps: WorkflowStep[]): Promise<{ error?: string }> {
  const user = await currentUser();
  if (!user) return { error: "Log in to save workflows to your account." };
  const clean = name.trim().slice(0, 80);
  if (!clean) return { error: "Give your workflow a name." };
  if (!validSteps(steps)) return { error: "A workflow needs 1 to 10 valid steps." };
  // Never store passwords from protect/unlock steps in the database.
  const safe = steps.map((s) => {
    const options = { ...s.options };
    delete options.password;
    delete options.repeat;
    return { tool: s.tool, options };
  });
  const serialized = JSON.stringify(safe);
  if (serialized.length > 20_000) return { error: "This workflow is too large to save." };
  const count = (db.prepare("SELECT COUNT(*) AS n FROM workflows WHERE user_id = ?").get(user.id) as { n: number }).n;
  if (count >= MAX_WORKFLOWS) return { error: `You can save up to ${MAX_WORKFLOWS} workflows. Delete one first.` };
  db.prepare("INSERT INTO workflows (user_id, name, steps, created_at) VALUES (?, ?, ?, ?)").run(
    user.id,
    clean,
    serialized,
    Date.now(),
  );
  return {};
}

export async function deleteWorkflow(id: number) {
  const user = await currentUser();
  if (!user) return;
  db.prepare("DELETE FROM workflows WHERE id = ? AND user_id = ?").run(id, user.id);
}
