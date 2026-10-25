// HTTP integration tests against a running Workify server.
//
//   npx vitest run -c vitest.integration.config.ts
//
// BASE_URL selects the server (default http://127.0.0.1:3100), e.g.
//   BASE_URL=https://staging.example.com npx vitest run -c vitest.integration.config.ts
//
// The server must already be running (next dev or next start); these tests
// never start, stop or build it. Test files run one after another so heavy
// tools (LibreOffice, OCR, Ghostscript) do not compete for the server's
// processing slots, and timeouts are generous because the first request to a
// dev-server route compiles it.
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    exclude: [...configDefaults.exclude, ".next/**", "data/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 240_000,
    hookTimeout: 240_000,
    retry: 0,
    env: { BASE_URL: process.env.BASE_URL ?? "http://127.0.0.1:3100" },
  },
});
