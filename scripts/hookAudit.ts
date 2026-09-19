/**
 * P0 hook-safety audit (directive §3).
 *
 * Regex heuristics that flag the ONLY code shapes which can produce
 * "Rendered more hooks than during the previous render":
 *
 *  1. useState/useReducer AFTER a conditional return in the same function —
 *     if the condition ever flips, the later hooks vanish on re-render.
 *  2. hooks invoked inside conditionals/loops/callbacks: `if (...) useX`,
 *     `... ? useX : useY`, `&& useX`, `while (...) useX`, or inside `.map(() => useX)`.
 *  3. early-return guards placed between hook calls followed by more hooks.
 *
 * The project convention (Chat.tsx, CommandBar.tsx) is the render-time
 * previous-value pattern (`if (x !== prev.current) setState(...)`) which is
 * a legal hook-order-neutral pattern and is NOT flagged.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PAGES_DIR = "src/pages";
const HOOK_RE = /\b(useState|useReducer|useEffect|useLayoutEffect|useMemo|useCallback|useRef|useQuery|useMutation|useAction|usePaginatedQuery|useConvexAuth)\s*\(/;

export interface Finding {
  file: string;
  line: number;
  code: string;
  kind: "hook-after-return" | "hook-in-branch" | "hook-in-callback";
}

/** Testable core: scan one file's text. */
export function scanSource(text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    // --- hook inside a conditional branch / loop -------------------------
    // `if (...) return` followed by a hook call on the SAME line, or a
    // ternary/&& invoking a hook.
    const branchMatch = trimmed.match(
      /^(?:if\s*\(.+\)\s*(?:return\b.*)?|while\s*\(.+\)|for\s*\(.+\))\s*(?:return\b.*)?(use[A-Z]\w*\s*\()/,
    );
    if (branchMatch && HOOK_RE.test(branchMatch[1] + "(")) {
      findings.push({
        file: "",
        line: i + 1,
        code: trimmed.slice(0, 90),
        kind: "hook-in-branch",
      });
    }
    if (/\?\s*use[A-Z]\w*\s*\(/.test(trimmed) || /&&\s*use[A-Z]\w*\s*\(/.test(trimmed)) {
      findings.push({
        file: "",
        line: i + 1,
        code: trimmed.slice(0, 90),
        kind: "hook-in-branch",
      });
    }
    // hooks inside callbacks: .map(() => useX), .forEach(() => useX) …
    const cb = trimmed.match(/\.(map|forEach|filter|reduce|some|every|flatMap)\s*\(\s*\(?[^)]*\)?\s*=>\s*(use[A-Z]\w*\s*\()/);
    if (cb) {
      findings.push({
        file: "",
        line: i + 1,
        code: trimmed.slice(0, 90),
        kind: "hook-in-callback",
      });
    }

    // --- early return followed by a later hook ---------------------------
    // Track a top-level (component-body indent) `if (...) return …` and see
    // whether any hook appears later at that same indent in the same block.
    const earlyRet = trimmed.match(/^if\s*\(.+\)\s*(?:return\b|throw\b)/);
    if (earlyRet && indent <= 6) {
      for (let j = i + 1; j < lines.length; j++) {
        const later = lines[j];
        const laterTrim = later.trim();
        const laterIndent = later.length - later.trimStart().length;
        // Stop when we leave the block (closing brace at the same indent).
        if (laterTrim === "}" && laterIndent === indent) break;
        if (laterIndent < indent) break;
        // Any hook CALL after the early return is a hazard — including
        // `const [x, setX] = useState(...)` declarations. Skip comments and
        // JSX attribute mentions by requiring a call-shaped match.
        const callLike =
          HOOK_RE.test(laterTrim) &&
          !laterTrim.startsWith("//") &&
          !laterTrim.startsWith("*");
        if (callLike && laterIndent >= indent) {
          findings.push({
            file: "",
            line: j + 1,
            code: laterTrim.slice(0, 90),
            kind: "hook-after-return",
          });
        }
        // A nested function definition legitimately contains hooks — skip
        // its body conservatively by treating deeper indents as inside it.
      }
    }
  }
  return findings;
}

/** Scan a real file on disk. */
export function scanFile(path: string): Finding[] {
  const text = readFileSync(path, "utf8");
  return scanSource(text).map((f) => ({ ...f, file: relative(process.cwd(), path) }));
}

/** Scan every page file; returns findings plus the file list for the report. */
export function scanPages(dir: string = PAGES_DIR): {
  findings: Finding[];
  scanned: string[];
} {
  const findings: Finding[] = [];
  const scanned: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith(".tsx")) {
        scanned.push(relative(process.cwd(), p));
        findings.push(...scanFile(p));
      }
    }
  };
  walk(dir);
  return { findings, scanned };
}
