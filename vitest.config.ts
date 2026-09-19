import { defineConfig } from "vitest/config";
import path from "path";

// Test runner for the backend security suite. Kept separate from the app's
// Vite config (which has React plugins and browser-targeted settings).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/convex/**/*.test.ts", "src/lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
