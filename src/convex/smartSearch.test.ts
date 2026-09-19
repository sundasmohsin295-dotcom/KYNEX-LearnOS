import { describe, expect, test } from "vitest";
import {
  buildSearchResults,
  emptySearchMessage,
  groupRows,
  scoreMatch,
  type RawConcept,
  type RawMaterial,
} from "./smartSearch";

const N = (s: string) => s;

function concept(p: Partial<RawConcept> & { label: string; materialId: string }): RawConcept {
  return {
    key: p.label.toLowerCase(),
    masteryState: "new",
    accuracy: null,
    difficulty: "medium",
    ...p,
  } as RawConcept;
}

function material(p: Partial<RawMaterial> & { title: string }): RawMaterial {
  return {
    _id: `m_${Math.random().toString(36).slice(2, 8)}`,
    kind: "pdf",
    status: "ready",
    wordCount: 1200,
    ...p,
  } as RawMaterial;
}

describe("scoreMatch", () => {
  test("exact match beats prefix beats substring", () => {
    const exact = scoreMatch("CIA triad", "cia triad");
    const prefix = scoreMatch("CIA triad explained", "cia");
    const substring = scoreMatch("the CIA triad", "cia");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
  });

  test("word-boundary substring beats mid-word substring", () => {
    const boundary = scoreMatch("the authentication flow", "authentication");
    const mid = scoreMatch("reauthentication", "authentication");
    expect(boundary).toBeGreaterThan(mid);
  });

  test("no match scores 0", () => {
    expect(scoreMatch("TCP congestion", "cia")).toBe(0);
  });

  test("empty needle scores 0 and never throws", () => {
    expect(scoreMatch("anything", "")).toBe(0);
    expect(scoreMatch("anything", "   ")).toBe(0);
  });
});

describe("buildSearchResults", () => {
  const base = {
    materials: [] as RawMaterial[],
    concepts: [],
    conversations: [],
    messages: [],
    mistakes: [],
    flashcards: [],
    missions: [],
    examiner: [],
  };

  test("returns [] for needles shorter than 2 chars", () => {
    expect(buildSearchResults("a", base)).toEqual([]);
    expect(buildSearchResults("  ", base)).toEqual([]);
  });

  test("concept hits carry mastery context; weak outranks mastered", () => {
    const rows = buildSearchResults("cia", {
      ...base,
      concepts: [
        concept({ label: "CIA Triad", materialId: "m1", masteryState: "mastered", accuracy: 92 }),
        concept({ label: "CIA Triad model", materialId: "m1", masteryState: "weak", accuracy: 45 }),
      ],
    });
    expect(rows.length).toBe(2);
    expect(rows[0].kind).toBe("concept");
    expect(rows[0].context).toContain("Weak");
    expect(rows[0].context).toContain("45% accuracy");
  });

  test("concept hit routes to its material with material context", () => {
    const rows = buildSearchResults("confidentiality", {
      ...base,
      concepts: [concept({ label: "Confidentiality", materialId: "m_sec", difficulty: "hard" })],
    });
    expect(rows[0].ref).toBe("/material/m_sec");
    expect(rows[0].context).toContain("hard");
  });

  test("message hits produce a snippet with conversation context", () => {
    const rows = buildSearchResults("authorization", {
      ...base,
      messages: [
        {
          conversationId: "c1",
          conversationTitle: "CIA Q&A",
          role: "assistant",
          content: "Authorization is about permissions, distinct from authentication which is identity.",
          createdAt: 1,
        },
      ],
    });
    expect(rows.length).toBe(1);
    expect(rows[0].title).toContain("Authorization");
    expect(rows[0].context).toContain("Professor said");
    expect(rows[0].context).toContain("CIA Q&A");
    expect(rows[0].ref).toBe("/chat?conv=c1");
  });

  test("mistake hits show resolution state and unresolved outranks resolved", () => {
    const rows = buildSearchResults("tripwire", {
      ...base,
      mistakes: [
        {
          _id: "mk1",
          question: "What does a tripwire do?",
          conceptLabel: "Intrusion detection",
          category: "conceptual",
          resolved: true,
          timesMissed: 2,
        },
        {
          _id: "mk2",
          question: "Where is a tripwire placed?",
          conceptLabel: "Tripwire",
          category: "memory",
          resolved: false,
          timesMissed: 3,
        },
      ],
    });
    expect(rows.length).toBe(2);
    expect(rows[0].ref).toBe("/mistakes");
    expect(rows[0].context).toContain("Unresolved");
    expect(rows[0].context).toContain("3×");
  });

  test("flashcard hits show due state", () => {
    const now = 1_000_000_000;
    const rows = buildSearchResults("symmetric", {
      ...base,
      flashcards: [
        { _id: "f1", front: "Symmetric vs asymmetric encryption?", back: "keys…", dueAt: now - 100, now },
      ],
    });
    expect(rows[0].context).toContain("Due now");
  });

  test("conversation hit deep-links with conv param and starred boost", () => {
    const rows = buildSearchResults("overview", {
      ...base,
      conversations: [
        { _id: "cv1", title: "Network overview", starred: true, materialTitle: null },
        { _id: "cv2", title: "Network overview part 2", starred: false, materialTitle: null },
      ],
    });
    expect(rows[0].ref).toBe("/chat?conv=cv1");
    expect(rows[0].context).toContain("Starred");
  });

  test("materials carry analyzed/word-count context and exact-title wins", () => {
    const rows = buildSearchResults("operating systems", {
      ...base,
      materials: [
        material({ title: "Operating Systems — Week 4 notes" }),
        material({ title: "Operating Systems" }),
      ],
    });
    expect(rows.length).toBe(2);
    expect(rows[0].title).toBe("Operating Systems");
    expect(rows[0].context).toContain("analyzed");
    expect(rows[0].context).toContain("1,200 words");
  });

  test("ranking is global across kinds, not per-kind (contextual top results)", () => {
    const rows = buildSearchResults("authentication", {
      ...base,
      concepts: [concept({ label: "Authentication", materialId: "m1", masteryState: "new" })],
      materials: [material({ title: "Authentication overview", wordCount: 5 })],
    });
    // Concept (new, +4 boost) with exact match (100) beats material prefix (≤80+6)
    expect(rows[0].kind).toBe("concept");
    expect(rows[1].kind).toBe("material");
  });

  test("groups respect kind ordering and per-group cap", () => {
    const rows = buildSearchResults("crypto", {
      ...base,
      messages: Array.from({ length: 6 }, (_, i) => ({
        conversationId: `c${i}`,
        conversationTitle: `T${i}`,
        role: "assistant" as const,
        content: `crypto ${i} — lorem ipsum crypto notes`,
        createdAt: i,
      })),
      materials: [material({ title: "Cryptography" })],
    });
    const groups = groupRows(rows);
    expect(groups[0].kind).toBe("material");
    const msgGroup = groups.find((g) => g.kind === "message");
    expect(msgGroup?.rows.length).toBe(4); // GROUP_CAP
    expect(groups.map((g) => g.kind)).not.toContain("concept");
  });
});

describe("emptySearchMessage", () => {
  test("names the needle and offers the real next action", () => {
    const msg = emptySearchMessage("quantum tunneling");
    expect(msg).toContain("quantum tunneling");
    expect(msg).toContain("Vault");
    expect(msg).toContain("Professor");
  });
});
