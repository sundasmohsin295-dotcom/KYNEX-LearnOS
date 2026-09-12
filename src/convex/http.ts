import { httpRouter } from "convex/server";
import { auth } from "./auth";

// ---------------------------------------------------------------------------
// HTTP security headers (defense in depth)
//
// The deployment serves this router at <deployment>.convex.site. Every
// response — including @convex-dev/auth's own routes — passes through
// `withSecurityHeaders`, which applies the headers a browser-facing API
// origin should always send:
//
//  - Content-Security-Policy: this is a pure JSON API surface (no HTML is
//    rendered), so `default-src 'none'` is the strictest correct policy;
//    `frame-ancestors 'none'` blocks clickjacking even where XFO is ignored.
//  - X-Frame-Options: DENY → frame-ancestors backstop for older browsers.
//  - X-Content-Type-Options: nosniff → no MIME sniffing of API responses.
//  - Referrer-Policy: no-referrer → never leak URLs cross-site.
//  - Permissions-Policy → browser APIs students never need.
//
// Cross-Origin-Opener-Policy / COEP / CORP are intentionally omitted: this
// endpoint is fetched cross-origin from the app domain (no window.open or
// embedding relationships), and COEP would break those fetches without
// adding protection.
// ---------------------------------------------------------------------------

type Router = ReturnType<typeof httpRouter>;
type RouteHandler = (ctx: unknown, request: Request) => Promise<Response>;

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

/**
 * Wrap an HttpRouter so every registered handler's response carries
 * `SECURITY_HEADERS`. `auth.addHttpRoutes()` mutates the router in place, so
 * the wrapper must be installed BEFORE auth routes are registered — that way
 * the auth endpoints are covered too.
 */
function withSecurityHeaders(router: Router): Router {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = (router as any).route.bind(router) as (
    path: string,
    method: string,
    handler: RouteHandler,
  ) => Router;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (router as any).route = (
    path: string,
    method: string,
    handler: RouteHandler,
  ) =>
    original(path, method, async (ctx, request) => {
      const response = await handler(ctx, request);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        // Never clobber a value a handler set deliberately.
        if (!response.headers.has(name)) {
          response.headers.set(name, value);
        }
      }
      return response;
    });

  return router;
}

const http = withSecurityHeaders(httpRouter());

auth.addHttpRoutes(http);

export default http;
