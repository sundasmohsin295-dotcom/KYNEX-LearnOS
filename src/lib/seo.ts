/**
 * KYNEX SEO infrastructure.
 *
 * Public marketing/legal/documentation routes are indexable and carry full
 * semantic metadata (description, OpenGraph, Twitter, JSON-LD). All private
 * app routes (dashboard, Vault, Professor, exams) render under the shell
 * below, which forces `robots: noindex, nofollow` regardless of the page.
 *
 * No third-party trackers. System health monitoring is server-side only
 * (aiCircuitBreaker / latencySamples / reliabilityEvents / qcEvents tables);
 * client telemetry is limited to the privacy-preserving clientErrors sink,
 * which stores sanitized messages, route and correlation ID: never stacks,
 * never user content.
 */

export const SITE_URL = "https://kynex.app";
export const SITE_NAME = "KYNEX";

export const SEO = {
  description:
    "KYNEX builds a living model of your academic journey and continuously determines the highest-impact action you should take next. Upload anything, understand everything, master every subject.",
  keywords: [
    "AI academic OS",
    "grounded RAG study assistant",
    "automated AI exam grader",
    "student mastery tracker",
    "AI study platform",
    "academic intelligence operating system",
  ],
} as const;

type MetaKind = "meta" | "property";

function upsertMeta(kind: MetaKind, key: string, content: string) {
  const attr = kind === "property" ? "property" : "name";
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertJsonLd(data: object) {
  const id = "kynex-jsonld";
  document.getElementById(id)?.remove();
  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

/** Page metadata the caller can override per route. */
export interface SeoInput {
  title: string;
  description?: string;
  /** Path only, e.g. "/privacy". Canonicalized against SITE_URL. */
  path: string;
}

/**
 * Apply per-route document metadata + JSON-LD. Returns a cleanup function so
 * private shells (AppShell) can strip marketing schema when navigating from a
 * public page into the app without a full reload.
 */
export function applySeo(input: SeoInput): () => void {
  const title = `${input.title} | ${SITE_NAME}`;
  const description = input.description ?? SEO.description;
  const url = `${SITE_URL}${input.path}`;

  document.title = title;
  upsertMeta("meta", "description", description);
  upsertMeta("meta", "robots", "index, follow");
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:url", url);
  upsertMeta("property", "og:site_name", SITE_NAME);
  upsertMeta("property", "og:type", "website");
  upsertMeta("meta", "twitter:card", "summary_large_image");
  upsertMeta("meta", "twitter:title", title);
  upsertMeta("meta", "twitter:description", description);

  upsertJsonLd({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "Academic Intelligence OS",
    url: SITE_URL,
    description: SEO.description,
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  });

  return () => {
    document.getElementById("kynex-jsonld")?.remove();
  };
}

/** Force noindex for every authenticated route. Non-overridable by pages. */
export function applyPrivateSeo(): () => void {
  document.title = `${SITE_NAME} | Academic Intelligence OS`;
  upsertMeta("meta", "robots", "noindex, nofollow");
  document.getElementById("kynex-jsonld")?.remove();
  return () => {};
}
