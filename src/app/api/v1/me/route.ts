import { authenticate } from "@/server/api";
import { handle, json } from "../_lib";

export const runtime = "nodejs";

/** Checks an API key: returns the account it belongs to. */
export async function GET(request: Request) {
  return handle(async () => {
    const user = authenticate(request);
    return json({ id: user.id, name: user.name, email: user.email });
  });
}
