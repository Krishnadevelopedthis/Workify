import { SITE_URL } from "@/lib/site";
import { signersOf, type SignRequest } from "@/server/sign-requests";

const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : null);

/** Public JSON shape of a signature request. */
export function requestJson(r: SignRequest, withSigners = false) {
  return {
    id: r.id,
    file_name: r.file_name,
    status: r.status === "pending" && Date.now() > r.expires_at ? "expired" : r.status,
    ordered: Boolean(r.ordered),
    created_at: iso(r.created_at),
    expires_at: iso(r.expires_at),
    completed_at: iso(r.completed_at),
    download_url: r.status === "completed" ? `${SITE_URL}/api/v1/signatures/${r.id}/file` : null,
    ...(withSigners && {
      signers: signersOf(r.id).map((s) => ({
        name: s.name,
        email: s.email,
        status: s.status,
        viewed_at: iso(s.viewed_at),
        signed_at: iso(s.signed_at),
        decline_reason: s.decline_reason,
      })),
    }),
  };
}
