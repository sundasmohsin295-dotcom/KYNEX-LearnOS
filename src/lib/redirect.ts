/**
 * Post-authentication redirect resolver.
 *
 * SECURITY: strict same-origin relative-path allowlist. A valid target is a
 * relative path: starts with exactly one "/", never "//" (protocol-relative),
 * contains no backslash (browsers treat "\" as "/", so "/\evil.com" becomes
 * "//evil.com"), and no control characters (C0 + DEL, checked by code point).
 *
 * React Router's navigate() cannot navigate off-origin regardless — this is
 * defense in depth so a hostile `?returnTo=` can never become an open
 * redirect if the navigation mechanism ever changes.
 *
 * Exported for the security regression test (redirect.test.ts).
 */
export function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
): string {
  // Bare "/" (the public landing page) is not a meaningful post-auth
  // destination — treat it as invalid and fall back.
  if (
    !returnTo ||
    returnTo.length < 2 ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//")
  ) {
    return fallback;
  }
  // "/\evil.com" passes the startsWith checks above — reject any backslash.
  for (const ch of returnTo) {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || code < 0x20 || code === 0x7f) {
      return fallback;
    }
  }
  return returnTo;
}
