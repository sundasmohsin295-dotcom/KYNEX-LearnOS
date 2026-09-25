import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Test runner for the backend security suite AND the §4 chaos suite.
// Kept separate from the app's Vite config (which has browser-targeted build
// settings). React plugin is required for the boundary integration tests
// (chaosBoundaries.test.tsx) to transform JSX.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "src/convex/**/*.test.ts",
      "src/lib/**/*.test.ts",
      "src/core/**/*.test.ts",
      "src/*.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
