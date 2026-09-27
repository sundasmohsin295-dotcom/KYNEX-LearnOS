import type { Doc } from "@/convex/_generated/dataModel";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** Backend analysis shape (client mirror of the AI output). */
export type LearningAnalysis = NonNullable<Doc<"materials">["analysis"]>;

export type Material = Doc<"materials">;
export type Mission = Doc<"missions">;
export type Flashcard = Doc<"flashcards">;
export type QuizAttempt = Doc<"quizAttempts">;
export type Conversation = Doc<"conversations">;
export type Message = Doc<"messages">;
export type MasteryRow = Doc<"masteryScores">;
export type GameProfile = Doc<"gameProfiles">;
export type Profile = Doc<"profiles">;

/** KYNEX Professor modes with learning depth. Keys are stable — they feed
 *  MODE_TO_AI and the /chat?mode= deep links. */
export const MODES = [
  { key: "summary", label: "Explain", depth: "CORE", desc: "The essentials, clearly structured", icon: "zap" },
  { key: "beginner", label: "From Zero", depth: "STARTER", desc: "Every term defined, no prior knowledge", icon: "sprout" },
  { key: "deep", label: "Deep Dive", depth: "ADVANCED", desc: "Mechanisms, reasoning, connections", icon: "microscope" },
  { key: "exam", label: "Exam Prep", depth: "EXAM", desc: "Examiner-style questions & traps", icon: "graduation" },
  { key: "feynman", label: "Feynman Check", depth: "CORE", desc: "Explain it back, find your gaps", icon: "lightbulb" },
  { key: "socratic", label: "Question", depth: "CORE", desc: "One probing question at a time", icon: "help" },
  { key: "visual", label: "Visual", depth: "CORE", desc: "Maps, flows and structures", icon: "map" },
  { key: "practice", label: "Practice", depth: "EXAM", desc: "Adaptive questions with feedback", icon: "target" },
  { key: "revision", label: "Recall Drill", depth: "CORE", desc: "Retrieval practice & memory hooks", icon: "refresh" },
  { key: "teach", label: "Teach Me", depth: "CORE", desc: "Tutor loop: step → check → advance", icon: "present" },
  { key: "debug", label: "Debug My Understanding", depth: "CORE", desc: "Finds the misconception behind a wrong belief", icon: "wrench" },
] as const;

export type ModeKey = (typeof MODES)[number]["key"];
export type Depth = (typeof MODES)[number]["depth"];

/** Mode → the AI mode instruction key consumed by the chat action. */
export const MODE_TO_AI: Record<ModeKey, string> = {
  summary: "explain",
  beginner: "zero",
  deep: "why",
  exam: "quiz",
  feynman: "feynman",
  socratic: "socratic",
  visual: "application",
  practice: "quiz",
  revision: "explain",
  teach: "teach",
  debug: "debugmyunderstanding",
};

/** Curiosity-gap helpers ------------------------------------------------- */

export function masteryPct(m: MasteryRow): number {
  if (m.attempts === 0) return 0;
  return Math.round((m.correct / m.attempts) * 100);
}

export function masteryState(m: MasteryRow): "mastered" | "learning" | "weak" | "new" {
  if (m.attempts === 0) return "new";
  const pct = masteryPct(m);
  if (pct >= 85 && m.attempts >= 3) return "mastered";
  if (pct < 60) return "weak";
  return "learning";
}

/** Deterministic pastel gradient per concept name (for knowledge nodes). */
export function conceptColor(name: string): { from: string; to: string } {
  const palettes = [
    { from: "#6366f1", to: "#8b5cf6" },
    { from: "#0ea5e9", to: "#6366f1" },
    { from: "#10b981", to: "#0ea5e9" },
    { from: "#f59e0b", to: "#f97316" },
    { from: "#ec4899", to: "#8b5cf6" },
    { from: "#14b8a6", to: "#10b981" },
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

/** Subject-agnostic material kind icon key. */
export function kindIcon(kind: string): string {
  switch (kind) {
    case "youtube": return "youtube";
    case "url": return "link";
    case "pdf": return "file";
    case "image": return "image";
    case "audio": return "audio";
    case "csv": return "table";
    case "code": return "code";
    default: return "text";
  }
}

/**
 * Precise, user-friendly extraction failures. `extractTextFromFile` throws
 * ONLY these — the AddMaterial boundary renders their messages verbatim,
 * so a corrupted upload produces guidance, never a stack trace.
 */
export class FileReadError extends Error {}
export class FilePasswordError extends FileReadError {}
export class FileEmptyError extends FileReadError {}

/**
 * Explicitly configure pdf.js's worker before first use. Bundler/CDN worker
 * resolution is the #1 source of "Setting up fake worker" failures and
 * broken ingestions; pinning a same-version workerSrc from a public CDN
 * removes it. Falls back to bundler resolution if the CDN is unreachable.
 */
let workerConfigured = false;
async function configurePdfWorker(pdfjs: typeof import("pdfjs-dist")): Promise<void> {
  if (workerConfigured) return;
  try {
    const version = pdfjs.version;
    const cdn = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
    const probe = await fetch(cdn, { method: "HEAD" });
    pdfjs.GlobalWorkerOptions.workerSrc = probe.ok
      ? cdn
      : `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  } catch {
    // Offline or blocked probe → leave bundler-resolved default in place.
  } finally {
    // Never retry the probe on every upload — one decision per session.
    workerConfigured = true;
  }
}

/** URL/file → plain text extraction (client-side, best effort per kind). */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";

  if (file.type.startsWith("text/") || ext === "txt" || ext === "md" || ext === "csv" || ext === "code") {
    return await file.text();
  }
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    await configurePdfWorker(pdfjs);
    let src: ArrayBuffer;
    try {
      src = await file.arrayBuffer();
    } catch {
      throw new FileReadError(
        "The file couldn't be opened (it may still be syncing or the download was interrupted). Re-download it and try again.",
      );
    }
    let pdf: PDFDocumentProxy;
    try {
      pdf = await pdfjs.getDocument({ data: src }).promise;
    } catch (e) {
      const msg = e instanceof Error ? String(e.message ?? e) : String(e);
      if (/password/i.test(msg)) {
        throw new FilePasswordError(
          "That PDF is password-protected. Remove the password (or export an unprotected copy) and upload it again.",
        );
      }
      throw new FileReadError(
        "That PDF appears to be corrupted or not a real PDF. Try re-saving it from the original app, or paste the text directly instead.",
      );
    }
    let out = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it: unknown) => (it as { str?: string }).str ?? "").join(" ") + "\n\n";
    }
    if (out.replace(/\s/g, "").length === 0) {
      throw new FileEmptyError(
        "That PDF has no readable text (it's likely a scan or image-only export). KYNEX needs selectable text — try a text-based copy or paste the content directly.",
      );
    }
    return out;
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth/mammoth.browser" as string);
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value;
  }
  if (ext === "pptx") {
    throw new FileReadError(
      "PPTX support is limited — please copy the slide text and paste it as text content instead.",
    );
  }
  // last resort: try as text
  try {
    return await file.text();
  } catch {
    throw new FileReadError(
      "KYNEX couldn't read that file type. Supported: PDF, DOCX, TXT, Markdown, CSV and pasted text.",
    );
  }
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Group materials by their subject id for the sidebar. */
export function groupBySubject<T extends { subjectId?: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.subjectId ?? "general";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}
