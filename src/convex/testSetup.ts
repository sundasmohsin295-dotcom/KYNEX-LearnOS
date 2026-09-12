/**
 * Shared convex-test module loader.
 *
 * convex-test resolves function modules relative to the schema directory and
 * REQUIRES the glob to include the generated files (`_generated`) so it can
 * locate the modules root. We glob everything under `src/convex` — function
 * modules plus the generated stubs — which is exactly what `convex dev`
 * bundles.
 */
export const modules = import.meta.glob("./**/*.*s");
