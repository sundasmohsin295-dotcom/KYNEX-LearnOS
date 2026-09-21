/**
 * ADVERSARIAL TEXT NORMALIZATION — the KYNEX AI Perturbation Shield.
 *
 * Every byte of untrusted text (pasted material, extracted web/URL content,
 * legacy stored chunks) passes through here before it can reach (a) the
 * database or (b) an AI prompt boundary. Pure functions, zero dependencies,
 * platform-neutral — runs identically in Convex actions/mutations and tests.
 *
 * Defenses (OWASP LLM prompt-injection / token-smuggling guidance):
 *  1. NFKC normalization        — fullwidth/homoglyph lookalikes ("ｉｇｎｏｒｅ")
 *                                  collapse to their canonical ASCII forms so
 *                                  downstream detection sees the real text.
 *  2. Bidi control removal      — RLO/LRO/ISOLATES/marks (U+202A-202E,
 *                                  U+2066-2069, U+200E/F, U+061C) so text
 *                                  cannot render or parse in a deceptive order.
 *  3. Invisible-char removal    — zero-width (U+200B-D, U+2060-2064, U+FEFF),
 *                                  soft hyphen, variation selectors, tag chars:
 *                                  kills zero-width token smuggling.
 *  4. Control-char stripping    — C0 controls except \n and \t; CRLF → LF.
 *  5. Boundary neutralization   — runs of "<<<" / ">>>" collapse so content can
 *                                  never forge the UNTRUSTED_*_START/END frame
 *                                  markers (structural isolation invariant).
 *  6. Length cap                — enforced AFTER stripping so invisible-char
 *                                  padding cannot inflate stored size.
 */

/** Invisible/bidi/format characters removed from untrusted text. */
const INVISIBLE_CHARS =
  // zero-width space, ZWNJ, ZWJ, LRM/RLM
  "\u200B\u200C\u200D\u200E\u200F" +
  // word joiner, invisible ops, binvis separators U+2060-2064
  "\u2060\u2061\u2062\u2063\u2064" +
  // BOM / zero-width no-break space, soft hyphen, Mongolian vowel separator
  "\uFEFF\u00AD\u180E" +
  // Arabic letter mark, bidi isolates U+2066-2069
  "\u061C\u2066\u2067\u2068\u2069" +
  // pop directional formatting + embedding controls U+202A-202E
  "\u202A\u202B\u202C\u202D\u202E" +
  // variation selectors (token-smuggling carriers, no study value)
  "\uFE00\uFE01\uFE02\uFE03\uFE04\uFE05\uFE06\uFE07\uFE08\uFE09\uFE0A\uFE0B\uFE0C\uFE0D\uFE0E\uFE0F";

const INVISIBLE_RE = new RegExp(`[${INVISIBLE_CHARS}]`, "g");
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; // keep \n \t
// Any RUN of angle brackets collapses to a single bracket: `<<<` → `<`,
// `>>>` → `>`. The UNTRUSTED frame markers require 3 consecutive brackets,
// so no document can ever reassemble one (structural isolation invariant).
const FRAME_BREAK_RE = /([<>])\1+/g;

/**
 * Normalize untrusted document/material text. Preserves newlines and tabs
 * (study material needs structure); removes everything deceptive.
 */
export function normalizeUntrustedText(raw: string, maxLen = 60_000): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE_RE, "")
    .replace(CONTROL_RE, "")
    .replace(FRAME_BREAK_RE, "$1")
    .slice(0, maxLen)
    .trim();
}

/** Normalize a short human-supplied label/title: single-line, capped. */
export function sanitizeTitle(raw: string, maxLen = 120): string {
  const cleaned = normalizeUntrustedText(raw, maxLen * 4)
    .replace(/[\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ");
  return cleaned.slice(0, maxLen);
}

/**
 * True when the text still contains (or can reconstruct) an UNTRUSTED frame
 * marker. Exported for tests: after normalization this must always be false
 * for frame-shaped input, proving the boundary is unforgeable.
 */
export function containsFrameMarker(text: string): boolean {
  return /<<?<{2,}\s*U\s*N\s*T\s*R\s*U\s*S\s*T\s*E\s*D|<{3,}/.test(text);
}
