import "server-only";
import { redirect } from "next/navigation";
import { localePath } from "@/i18n/config";
import { getLang } from "@/i18n/server";
import { currentUser, type User } from "./auth";

/**
 * The signed-in user, or a redirect to the login page. Pages call this
 * themselves: layouts and pages render in parallel, so a check in the
 * layout alone does not protect the page.
 */
export async function requireUser(next: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(localePath(await getLang(), `/login?next=${encodeURIComponent(next)}`));
  return user;
}
