import { describe, expect, test } from "vitest";
import { resolveRedirectAfterAuth } from "./redirect";

/**
 * SECURITY REGRESSION — open-redirect defense for post-auth navigation.
 *
 * A hostile `?returnTo=` must never become an off-origin redirect. The
 * resolver allows only same-origin relative paths: one leading "/", no
 * protocol-relative "//", no backslash (browsers treat "\" as "/"), no
 * control characters.
 */
describe("resolveRedirectAfterAuth (open-redirect regression)", () => {
  test("allows legitimate internal paths, preserving query and hash", () => {
    expect(resolveRedirectAfterAuth("/dashboard")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("/chat?c=abc123")).toBe("/chat?c=abc123");
    expect(resolveRedirectAfterAuth("/subjects/456#overview")).toBe(
      "/subjects/456#overview",
    );
  });

  test("blocks absolute URLs to other origins", () => {
    expect(resolveRedirectAfterAuth("https://evil.example/steal")).toBe(
      "/dashboard",
    );
    expect(resolveRedirectAfterAuth("http://evil.example")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("javascript:alert(1)")).toBe("/dashboard");
  });

  test("blocks protocol-relative URLs", () => {
    expect(resolveRedirectAfterAuth("//evil.example")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("///evil.example")).toBe("/dashboard");
  });

  test("blocks backslash tricks (browsers treat \\ as /)", () => {
    expect(resolveRedirectAfterAuth("/\\evil.example")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("\\/evil.example")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("\\\\evil.example")).toBe("/dashboard");
  });

  test("blocks control characters and whitespace-prefixed strings", () => {
    expect(resolveRedirectAfterAuth("/x\u0000y")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("/\u001f")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth(" /dashboard")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("\t/dashboard")).toBe("/dashboard");
  });

  test("falls back for null/empty and honors a custom fallback", () => {
    expect(resolveRedirectAfterAuth(null)).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("/", "/onboarding")).toBe("/onboarding");
  });
});
