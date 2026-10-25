// Fails fast, with a useful message, when the server under test is not reachable.
export default async function setup() {
  const base = (process.env.BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(120_000) });
    if (res.status !== 200 && res.status !== 503) throw new Error(`status ${res.status}`);
  } catch (e) {
    const hint = base.includes("127.0.0.1") ? ` (if the dev server listens on IPv6 only, try BASE_URL=${base.replace("127.0.0.1", "localhost")})` : "";
    throw new Error(`Workify is not reachable at ${base}: ${(e as Error).message}${hint}`);
  }
}
