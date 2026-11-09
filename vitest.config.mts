import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Playwright specs live in e2e/ and are run by `npm run test:e2e`.
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    // Unit tests never reach the database, but modules they import read the
    // environment. These are placeholders, deliberately not a real connection
    // string, so a test that does try to connect fails loudly.
    env: {
      DATABASE_URL: "postgresql://unit-tests/not-a-real-database",
      AUTH_SECRET: "unit-test-secret-not-used-for-anything",
      IP_HASH_SALT: "unit-test-salt-0123456789abcdef",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
