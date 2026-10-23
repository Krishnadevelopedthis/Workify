import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/": `${src}/`,
      // The real package throws outside a React Server Components bundle.
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, ".next/**", "data/**"],
  },
});
