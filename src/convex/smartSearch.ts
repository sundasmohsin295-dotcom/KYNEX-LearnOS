/**
 * KYNEX Smart Search — pure, deterministic ranking (directive §33).
 *
 * Searches across Subjects, Materials, Concepts (with mastery context),
 * Notes/Messages, Mistakes, Flashcards, Missions and Examiner results,
 * returning contextual rows — e.g. a concept hit carries its mastery state,
 * a conversation hit carries its material context — never a bare string list.
 *
 * Ranking is evidence-based: exact > prefix > substring, boosted by context
 * (mastered concepts rank below weak ones — weak knowledge is what a student
 * is usually searching to fix). No AI, no fabricated results.
 */

export type SearchKind =
  | "material"
  | "concept"
  | "conversation"
  | "message"
  | "mistake"
  | "flashcard"
  | "mission"
  | "examiner";

export interface SearchRow {
  kind: SearchKind;
  /** Primary label shown to the user. */
  title: string;
  /** One line of context (mastery state, mistake category, due date…). */
  context: string;
  /** Client routing target (route + params encoded by the UI layer). */
  ref: string;
  score: number;
}

/** Lower is better; groups sort by this. */
const KIND_ORDER: Record<SearchKind, number> = {
  material: 0,
  concept: 1,
  conversation: 2,
  mistake: 3,
  flashcard: 4,
  mission: 5,
  examiner: 6,
  message: 7,
};

const GROUP_CAP = 4;
const MAX_ROWS = 24;

/** Base relevance for a case-insensitive needle match on a field. */
export function scoreMatch(field: string, needle: string): number {
  const h = field.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (!n) return 0;
  if (h === n) return 100;
  if (h.startsWith(n)) return 80 - Math.min(h.length - n.length, 20);
  const idx = h.indexOf(n);
  if (idx === -1) return 0;
  // Word-boundary substring beats mid-word substring.
  const before = idx === 0 ? " " : h[idx - 1];
  const boundary = before === " " || before === "\n" || before === "·" ? 12 : 0;
  return 40 + boundary - Math.min(idx, 15);
}

/** All searchable text fields for one entity, with weights. */
function bestFieldScore(
  fields: Array<{ text: string; weight: number }>,
  needle: string,
): number {
  let best = 0;
  for (const f of fields) {
    const s = scoreMatch(f.text, needle);
    if (s > 0) best = Math.max(best, Math.round(s * f.weight));
  }
  return best;
}

// --- Raw row shapes (mirrors of the Convex docs the query passes in) -------

export interface RawMaterial {
  _id: string;
  title: string;
  kind: string;
  status: string;
  wordCount: number;
}
export interface RawConcept {
  key: string;
  label: string;
  materialId: string;
  masteryState: "mastered" | "learning" | "weak" | "new";
  accuracy: number | null;
  difficulty: string;
}
export interface RawConversation {
  _id: string;
  title: string;
  starred: boolean;
  materialTitle: string | null;
}
export interface RawMessage {
  conversationId: string;
  conversationTitle: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}
export interface RawMistake {
  _id: string;
  question: string;
  conceptLabel: string;
  category: string;
  resolved: boolean;
  timesMissed: number;
}
export interface RawFlashcard {
  _id: string;
  front: string;
  back: string;
  dueAt: number;
  now: number;
}
export interface RawMission {
  _id: string;
  title: string;
  kind: string;
  status: string;
}
export interface RawExaminer {
  _id: string;
  question: string;
  conceptLabel: string;
  marksAwarded: number;
  marksTotal: number;
}

const MASTERY_CONTEXT: Record<RawConcept["masteryState"], string> = {
  weak: "Weak — needs practice",
  learning: "Learning",
  mastered: "Mastered",
  new: "Not practiced yet",
};

/** Weak concepts rank higher: that's usually what a student is searching for. */
const MASTERY_BOOST: Record<RawConcept["masteryState"], number> = {
  weak: 18,
  learning: 8,
  new: 4,
  mastered: 0,
};

export function buildSearchResults(needle: string, raw: {
  materials: RawMaterial[];
  concepts: RawConcept[];
  conversations: RawConversation[];
  messages: RawMessage[];
  mistakes: RawMistake[];
  flashcards: RawFlashcard[];
  missions: RawMission[];
  examiner: RawExaminer[];
}): SearchRow[] {
  const n = needle.trim();
  if (n.length < 2) return [];

  const rows: SearchRow[] = [];

  for (const m of raw.materials) {
    const s = bestFieldScore(
      [{ text: m.title, weight: 1 }],
      n,
    );
    if (s > 0) {
      rows.push({
        kind: "material",
        title: m.title,
        context: `${m.kind} · ${m.status === "ready" ? "analyzed" : m.status} · ${m.wordCount.toLocaleString()} words`,
        ref: `/material/${m._id}`,
        score: s + (m.status === "ready" ? 6 : 0),
      });
    }
  }

  for (const c of raw.concepts) {
    const s = bestFieldScore(
      [{ text: c.label, weight: 1 }, { text: c.key, weight: 0.5 }],
      n,
    );
    if (s > 0) {
      rows.push({
        kind: "concept",
        title: c.label,
        context:
          MASTERY_CONTEXT[c.masteryState] +
          (c.accuracy !== null ? ` · ${c.accuracy}% accuracy` : "") +
          ` · ${c.difficulty}`,
        ref: `/material/${c.materialId}`,
        score: s + MASTERY_BOOST[c.masteryState],
      });
    }
  }

  for (const c of raw.conversations) {
    const s = bestFieldScore(
      [{ text: c.title, weight: 1 }],
      n,
    );
    if (s > 0) {
      rows.push({
        kind: "conversation",
        title: c.title,
        context: c.starred ? "Starred conversation" : "Conversation",
        ref: `/chat?conv=${c._id}`,
        score: s + (c.starred ? 5 : 0),
      });
    }
  }

  for (const msg of raw.messages) {
    if (msg.content.length > 4000) continue; // sanity cap
    const idx = msg.content.toLowerCase().indexOf(n.toLowerCase());
    if (idx === -1) continue;
    const start = Math.max(0, idx - 40);
    const snippet =
      (start > 0 ? "…" : "") + msg.content.slice(start, idx + n.length + 60).trim() + "…";
    rows.push({
      kind: "message",
      title: snippet,
      context: `${msg.role === "user" ? "You asked" : "Professor said"} in “${msg.conversationTitle}”`,
      ref: `/chat?conv=${msg.conversationId}`,
      score: 42 - Math.min(idx, 20),
    });
  }

  for (const m of raw.mistakes) {
    const s = bestFieldScore(
      [{ text: m.question, weight: 1 }, { text: m.conceptLabel, weight: 0.7 }],
      n,
    );
    if (s > 0) {
      rows.push({
        kind: "mistake",
        title: m.question,
        context:
          (m.resolved
            ? "Resolved"
            : `Unresolved · missed ${m.timesMissed}×`) + ` · ${m.category}`,
        ref: `/mistakes`,
        score: s + (m.resolved ? 0 : 10),
      });
    }
  }

  for (const f of raw.flashcards) {
    const s = bestFieldScore(
      [{ text: f.front, weight: 1 }, { text: f.back, weight: 0.5 }],
      n,
    );
    if (s > 0) {
      const due = f.dueAt <= f.now ? "Due now" : "Scheduled";
      rows.push({
        kind: "flashcard",
        title: f.front,
        context: `${due} · flashcard`,
        ref: `/flashcards`,
        score: s,
      });
    }
  }

  for (const m of raw.missions) {
    const s = bestFieldScore([{ text: m.title, weight: 1 }], n);
    if (s > 0) {
      rows.push({
        kind: "mission",
        title: m.title,
        context: m.status === "active" ? "Active mission" : "Completed mission",
        ref: `/mission`,
        score: s + (m.status === "active" ? 6 : 0),
      });
    }
  }

  for (const e of raw.examiner) {
    const s = bestFieldScore(
      [{ text: e.question, weight: 1 }, { text: e.conceptLabel, weight: 0.7 }],
      n,
    );
    if (s > 0) {
      rows.push({
        kind: "examiner",
        title: e.question,
        context: `Examiner · ${e.marksAwarded}/${e.marksTotal} marks`,
        ref: `/examiner`,
        score: s,
      });
    }
  }

  return rows
    .sort((a, b) => b.score - a.score || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    .slice(0, MAX_ROWS);
}

/** Group rows by kind for grouped rendering, preserving ranking order. */
export function groupRows(rows: SearchRow[]): Array<{ kind: SearchKind; label: string; rows: SearchRow[] }> {
  const labels: Record<SearchKind, string> = {
    material: "Vault materials",
    concept: "Concepts",
    conversation: "Conversations",
    message: "In conversations",
    mistake: "Mistake Bank",
    flashcard: "Flashcards",
    mission: "Missions",
    examiner: "Examiner evaluations",
  };
  const order: SearchKind[] = ["material", "concept", "conversation", "mistake", "flashcard", "mission", "examiner", "message"];
  const out: Array<{ kind: SearchKind; label: string; rows: SearchRow[] }> = [];
  for (const kind of order) {
    const group = rows.filter((r) => r.kind === kind).slice(0, GROUP_CAP);
    if (group.length > 0) out.push({ kind, label: labels[kind], rows: group });
  }
  return out;
}

/** Microcopy for an empty result — never a bare "No results". */
export function emptySearchMessage(needle: string): string {
  return `Nothing in your KYNEX matches “${needle.trim()}” yet. Add material about it to the Vault, or ask the Professor directly.`;
}
