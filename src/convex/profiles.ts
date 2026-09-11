import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { ensureProfiles, levelForXp, todayKey, XP_PER_LEVEL } from "./gamification";
import { enforceRateLimit, logAuditEvent } from "./security";

/** Full app bootstrap for the signed-in user: profile, game stats, missions.
 *  Read-only: if the profile rows don't exist yet (no mutation has run), returns
 *  null and the client shows onboarding — updateProfile/seedDemoData create them. */
export const myOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const game = await ctx.db
      .query("gameProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!profile || !game) return null;

    // today's study minutes
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const sessions = await ctx.db
      .query("studySessions")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", userId).gte("createdAt", dayStart.getTime()),
      )
      .collect();
    const todayMinutes = sessions.reduce((n, s) => n + s.minutes, 0);

    // weekly minutes for chart
    const weekStart = dayStart.getTime() - 6 * 24 * 3600 * 1000;
    const week = await ctx.db
      .query("studySessions")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", userId).gte("createdAt", weekStart),
      )
      .collect();
    const weekMinutes: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      weekMinutes[todayKey(Date.now() - i * 24 * 3600 * 1000)] = 0;
    }
    for (const s of week) {
      const k = todayKey(s.createdAt);
      weekMinutes[k] = (weekMinutes[k] ?? 0) + s.minutes;
    }

    const activeMissions = await ctx.db
      .query("missions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();

    const recentXp = await ctx.db
      .query("xpEvents")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(8);

    const masteryRows = await ctx.db
      .query("masteryScores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const now = Date.now();
    const dueCards = await ctx.db
      .query("flashcards")
      .withIndex("by_user_due", (q) => q.eq("userId", userId).lte("dueAt", now))
      .collect();

    // next exam
    const exams = await ctx.db
      .query("exams")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("examDate", now))
      .order("asc")
      .take(1);

    const questionsAnswered = masteryRows.reduce((n, m) => n + m.attempts, 0);
    const totalCorrect = masteryRows.reduce((n, m) => n + m.correct, 0);
    const mastered = masteryRows.filter(
      (m) => m.attempts >= 3 && m.correct / m.attempts >= 0.85,
    ).length;

    return {
      profile,
      game,
      levelPct: Math.min(
        100,
        Math.round(((game.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100),
      ),
      todayMinutes,
      weekMinutes: Object.entries(weekMinutes).map(([day, minutes]) => ({
        day,
        minutes,
      })),
      activeMissions,
      recentXp,
      mastery: masteryRows,
      stats: {
        questionsAnswered,
        accuracy:
          questionsAnswered > 0
            ? Math.round((totalCorrect / questionsAnswered) * 100)
            : 0,
        mastered,
        weakCount: masteryRows.filter(
          (m) => m.attempts >= 2 && m.correct / m.attempts < 0.6,
        ).length,
        dueCards: dueCards.length,
        streakSafe: game.lastStudyDay === todayKey(now),
      },
      nextExam: exams[0] ?? null,
    };
  },
});

/** Update the learner's display name / study goal. */
export const updateProfile = mutation({
  args: {
    name: v.string(),
    educationLevel: v.optional(v.string()),
    institution: v.optional(v.string()),
    studyGoal: v.optional(v.string()),
    goalMinutesPerDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { profile, game } = await ensureProfiles(ctx, args.name);
    await ctx.db.patch(profile._id, {
      name: args.name,
      educationLevel: args.educationLevel ?? profile.educationLevel,
      institution: args.institution ?? profile.institution,
      studyGoal: args.studyGoal ?? profile.studyGoal,
      onboardingComplete: true,
    });
    await ctx.db.patch(game._id, {
      goalMinutesPerDay: args.goalMinutesPerDay ?? game.goalMinutesPerDay,
    });
  },
});

/** KYNEX Twin — academic identity + GPA goals (self-reported, validated). */
export const setAcademicProfile = mutation({
  args: {
    degree: v.optional(v.string()),
    department: v.optional(v.string()),
    university: v.optional(v.string()),
    semester: v.optional(v.number()),
    creditHours: v.optional(v.number()),
    gradingScale: v.optional(v.union(v.literal("4.0"), v.literal("5.0"))),
    currentGpa: v.optional(v.number()),
    currentCgpa: v.optional(v.number()),
    targetGpa: v.optional(v.number()),
    targetCgpa: v.optional(v.number()),
    goalMinutesPerDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { profile, game } = await ensureProfiles(ctx);
    const gpaMax = args.gradingScale === "5.0" ? 5 : 4;
    const valid = (n: number | undefined) =>
      typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= gpaMax ? n : undefined;

    await ctx.db.patch(profile._id, {
      degree: args.degree?.slice(0, 80) ?? profile.degree,
      department: args.department?.slice(0, 80) ?? profile.department,
      university: args.university?.slice(0, 80) ?? profile.university,
      semester: typeof args.semester === "number" && args.semester >= 1 && args.semester <= 12
        ? args.semester
        : profile.semester,
      creditHours: typeof args.creditHours === "number" && args.creditHours >= 1 && args.creditHours <= 30
        ? args.creditHours
        : profile.creditHours,
      gradingScale: args.gradingScale ?? profile.gradingScale,
      currentGpa: valid(args.currentGpa) ?? profile.currentGpa,
      currentCgpa: valid(args.currentCgpa) ?? profile.currentCgpa,
      targetGpa: valid(args.targetGpa) ?? profile.targetGpa,
      targetCgpa: valid(args.targetCgpa) ?? profile.targetCgpa,
    });
    await ctx.db.patch(game._id, {
      goalMinutesPerDay: args.goalMinutesPerDay ?? game.goalMinutesPerDay,
    });
  },
});

/**
 * KYNEX Insights — pulse trends, mistake bank, and exam radar.
 * Everything is computed from REAL user activity (quiz attempts, reviews,
 * materials). No synthetic predictions, no invented exam frequency.
 */
export const myInsights = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const now = Date.now();
    const attempts = await ctx.db
      .query("quizAttempts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const completed = attempts
      .filter((a) => a.status === "completed" && a.answers.length > 0)
      .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));

    // ---- accuracy trend: first half vs second half of completed sessions ----
    let accuracyTrend: { from: number; to: number; delta: number } | null = null;
    if (completed.length >= 2) {
      const avg = (list: typeof completed) => {
        const qs = list.flatMap((a) => a.answers);
        return qs.length > 0 ? (qs.filter((x) => x.correct).length / qs.length) * 100 : 0;
      };
      const half = Math.floor(completed.length / 2);
      const from = Math.round(avg(completed.slice(0, half)));
      const to = Math.round(avg(completed.slice(half)));
      accuracyTrend = { from, to, delta: to - from };
    }

    // ---- recall trend: first half vs second half of the last 20 reviews ----
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_user_reviewed", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
    const grades = [...reviews].reverse().map((r) => r.grade);
    let recallTrend: { from: number; to: number; delta: number } | null = null;
    if (grades.length >= 6) {
      const score = (g: string) => (g === "again" ? 0 : g === "hard" ? 0.6 : g === "good" ? 1 : 1.2);
      const avg = (arr: string[]) => (arr.length > 0 ? (arr.reduce((n, g) => n + score(g), 0) / arr.length) * 100 : 0);
      const half = Math.floor(grades.length / 2);
      const from = Math.round(avg(grades.slice(0, half)));
      const to = Math.round(avg(grades.slice(half)));
      recallTrend = { from, to, delta: to - from };
    }

    // ---- consistency: distinct study days out of the last 14 ----
    const sessions = await ctx.db
      .query("studySessions")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", userId).gte("createdAt", now - 14 * 86400000),
      )
      .collect();
    const days = new Set(sessions.map((s) => todayKey(s.createdAt)));
    const consistency = Math.round((days.size / 14) * 100);

    // ---- mastery overview + strongest / weakest ----
    const mastery = await ctx.db
      .query("masteryScores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const attemptedRows = mastery.filter((m) => m.attempts > 0);
    const overallMastery = attemptedRows.length > 0
      ? Math.round(
          (attemptedRows.reduce((n, m) => n + m.correct / m.attempts, 0) / attemptedRows.length) * 100,
        )
      : 0;
    const sorted = [...attemptedRows].sort(
      (a, b) => a.correct / a.attempts - b.correct / b.attempts,
    );
    const weakest = sorted[0] ?? null;
    const strongest = sorted[sorted.length - 1] ?? null;

    const totalAttempts = attemptedRows.reduce((n, m) => n + m.attempts, 0);
    const totalCorrect = attemptedRows.reduce((n, m) => n + m.correct, 0);
    const overallAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

    // ---- exam readiness: blend of real signals (labelled as an estimate in UI) ----
    const examReadiness = Math.round(
      overallMastery * 0.5 + overallAccuracy * 0.3 + consistency * 0.2,
    );

    // ---- Mistake bank: real wrong answers, classified by quiz metadata ----
    const mistakeBuckets: Record<
      string,
      { label: string; count: number; concepts: Map<string, number> }
    > = {
      ConceptGap: { label: "Concept Gap", count: 0, concepts: new Map() },
      Application: { label: "Application", count: 0, concepts: new Map() },
      Reasoning: { label: "Reasoning", count: 0, concepts: new Map() },
    };
    for (const a of completed) {
      for (let i = 0; i < a.answers.length; i++) {
        const ans = a.answers[i];
        const q = a.questions[i];
        if (!ans || ans.correct || !q) continue;
        const key = q.type === "application" ? "Application" : q.type === "analysis" ? "Reasoning" : "ConceptGap";
        const bucket = mistakeBuckets[key];
        bucket.count += 1;
        bucket.concepts.set(q.concept, (bucket.concepts.get(q.concept) ?? 0) + 1);
      }
    }
    const mistakes = Object.values(mistakeBuckets)
      .filter((b) => b.count > 0)
      .map((b) => ({
        label: b.label,
        count: b.count,
        topConcepts: [...b.concepts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c]) => c),
      }))
      .sort((a, b) => b.count - a.count);

    // ---- Exam Radar: per-concept evidence score (0-100) from real data ----
    // score = mastery deficit (60%) + recency of struggle (25%) + difficulty weight (15%)
    const radar = attemptedRows
      .map((m) => {
        const acc = m.correct / m.attempts;
        const daysSince = Math.max(0, (now - m.lastPracticedAt) / 86400000);
        const recency = Math.max(0, 1 - daysSince / 21); // practiced within 3 weeks
        const hardWeight = 1; // difficulty evidence comes from analysis.concepts when present
        return {
          conceptLabel: m.conceptLabel,
          conceptKey: m.conceptKey,
          materialId: m.materialId,
          accuracy: Math.round(acc * 100),
          attempts: m.attempts,
          priority: Math.round(
            (1 - acc) * 60 + recency * 25 + (m.attempts >= 3 ? 15 * hardWeight : 5),
          ),
        };
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10);

    const answeredCount = attempts.reduce((n, a) => n + a.answers.length, 0);

    return {
      accuracyTrend,
      recallTrend,
      consistency,
      overallMastery,
      overallAccuracy,
      examReadiness,
      weakest: weakest && { label: weakest.conceptLabel, accuracy: Math.round((weakest.correct / weakest.attempts) * 100) },
      strongest: strongest && { label: strongest.conceptLabel, accuracy: Math.round((strongest.correct / strongest.attempts) * 100) },
      mistakes,
      radar,
      answeredCount,
      sessionsAnalyzed: completed.length,
    };
  },
});

/** Seeds one demo subject + material with a pre-baked analysis so a brand-new
 *  account has something to explore immediately. Returns the material id. */
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const { profile } = await ensureProfiles(ctx);
    if (profile.seededDemo) return null;
    await ctx.db.patch(profile._id, { seededDemo: true });

    const now = Date.now();
    const subjectId = await ctx.db.insert("subjects", {
      userId,
      name: "Computer Networks",
      color: "#6366f1",
    });

    const analysis = {
      title: "IP Addressing & Subnetting",
      summary:
        "IP addressing gives every device on a network a unique numeric address. Subnetting splits a large network into smaller segments (subnets) by borrowing bits from the host portion of an IPv4 address, improving routing efficiency and security. The subnet mask defines where the network portion ends and the host portion begins, and CIDR notation (e.g. /24) expresses that split compactly.",
      deepExplanation:
        "An IPv4 address is a 32-bit number written as four octets (e.g. 192.168.1.0). It contains two logical parts: the network prefix and the host identifier. The prefix length, written in CIDR notation as /N, says how many leading bits belong to the network. To subnet, you extend the prefix: a /24 network has 8 host bits = 254 usable hosts; changing it to /26 borrows 2 bits, creating 4 subnets with 62 usable hosts each. The subnet mask is derived by setting the first N bits to 1 (255.255.255.192 for /26). Usable hosts = 2^h − 2 because the all-zero host address denotes the network itself and all-ones is the broadcast address. Routers use these boundaries to decide where packets travel: an IP is ANDed with the mask, and if the result matches the local subnet the packet is delivered directly, otherwise it is forwarded to the gateway.",
      keyPoints: [
        "IPv4 addresses are 32 bits, split into network + host portions",
        "CIDR notation /N gives the network prefix length",
        "Subnetting borrows host bits to create multiple smaller networks",
        "2^s subnets, 2^(h−2) usable hosts per subnet",
        "Routers make forwarding decisions using masks and prefixes",
      ],
      concepts: [
        {
          name: "IPv4 Address Structure",
          explanation:
            "A 32-bit address in dotted-decimal form; the leading bits identify the network, trailing bits identify the host on that network.",
          difficulty: "easy" as const,
        },
        {
          name: "Subnet Mask",
          explanation:
            "A bitmask where 1-bits mark the network portion. Used to separate network from host: 255.255.255.0 = /24.",
          difficulty: "easy" as const,
        },
        {
          name: "CIDR Notation",
          explanation:
            "Compact way to express prefix length, e.g. 192.168.1.0/24. Replaces the old classful A/B/C system.",
          difficulty: "medium" as const,
        },
        {
          name: "Subnetting",
          explanation:
            "Dividing a network into smaller subnets by extending the prefix. Key skill: computing subnets, hosts, and ranges.",
          difficulty: "hard" as const,
        },
        {
          name: "Broadcast Address",
          explanation:
            "The all-ones host address in a subnet; packets sent here reach every host on that subnet.",
          difficulty: "medium" as const,
        },
      ],
      definitions: [
        { term: "IP address", definition: "A unique numeric identifier for a device on a network." },
        { term: "Subnet", definition: "A logical subdivision of an IP network." },
        { term: "Prefix length", definition: "Number of leading bits that make up the network portion (/N)." },
        { term: "Gateway", definition: "The router that forwards traffic between subnets." },
      ],
      formulas: [
        { name: "Subnets created", expression: "2^s (s = borrowed bits)", note: "Borrowing 2 bits → 4 subnets" },
        { name: "Usable hosts", expression: "2^h − 2 (h = host bits)", note: "Minus network + broadcast addresses" },
        { name: "Block size", expression: "256 − mask octet", note: "Jump between consecutive subnet networks" },
      ],
      examples: [
        {
          title: "Split 192.168.1.0/24 into 4 subnets",
          walkthrough:
            "Need 4 subnets → borrow 2 bits → new prefix /26, mask 255.255.255.192. Block size = 256−192 = 64. Networks: 192.168.1.0, .64, .128, .192. Each has 62 usable hosts (.1–.62 style ranges).",
        },
        {
          title: "Which subnet does 192.168.1.100/26 belong to?",
          walkthrough:
            "100 falls in the 64–127 block, so the subnet is 192.168.1.64/26. Network = .64, broadcast = .127, usable hosts .65–.126.",
        },
      ],
      applications: [
        "Enterprise networks isolate departments with subnets",
        "Cloud VPCs use CIDR blocks for address planning",
        "Home routers hand out /24 ranges by default",
      ],
      misconceptions: [
        {
          wrong: "A /24 network has 256 usable host addresses",
          why: "Students forget two addresses are reserved",
          correct: "It has 254 usable hosts — network (.0) and broadcast (.255) are unusable",
        },
        {
          wrong: "Subnetting changes the physical network",
          why: "Subnets are logical, not physical",
          correct: "Subnets are a logical partition; hardware can stay identical",
        },
      ],
      commonMistakes: [
        "Using block size 32 instead of 64 when the mask octet is 192",
        "Forgetting to reserve the network and broadcast addresses",
        "Confusing host bits with borrowed bits when counting",
      ],
      prerequisites: ["Binary number system", "Basic network topologies"],
      causeEffect: [
        { cause: "Borrowing more host bits", effect: "More subnets, fewer hosts per subnet" },
        { cause: "Larger subnets than needed", effect: "Wasted address space, harder routing tables" },
      ],
      remember: [
        "2^s subnets, 2^h−2 usable hosts",
        "Block size = 256 − mask octet",
      ],
      applySkills: [
        "Given any prefix, compute network, broadcast and host range",
        "Design a subnet plan for N departments of given sizes",
      ],
      examinerQuestions: [
        "A company needs 6 subnets with at least 30 hosts each. Propose an addressing plan from 192.168.10.0/24.",
        "Explain why 192.168.1.255/26 is not a valid host address.",
        "Compare classful and classless addressing.",
      ],
      practiceAreas: [
        { name: "Subnetting", reason: "Multi-step calculations are easy to slip on under exam pressure" },
        { name: "CIDR Notation", reason: "Frequent conversion between masks and prefixes" },
      ],
      model: "seed",
      analyzedAt: now,
    };

    const materialId = await ctx.db.insert("materials", {
      userId,
      subjectId,
      title: "IP Addressing & Subnetting — Chapter 4",
      kind: "pdf",
      status: "ready",
      charCount: analysis.summary.length + (analysis.deepExplanation?.length ?? 0),
      wordCount: 320,
      chunkCount: 2,
      analysis,
      createdAt: now - 86400000,
      updatedAt: now - 86400000,
    });

    await ctx.db.insert("materialChunks", {
      userId,
      materialId,
      idx: 0,
      text: analysis.summary + "\n\n" + analysis.deepExplanation,
    });

    // pre-existing (weaker) practice history so the NEXT MOVE has evidence
    await ctx.db.insert("masteryScores", {
      userId,
      subjectId,
      materialId,
      conceptKey: "subnetting",
      conceptLabel: "Subnetting",
      correct: 3,
      attempts: 7,
      confidenceSum: 2.1,
      confidenceCount: 7,
      lastPracticedAt: now - 2 * 86400000,
    });
    await ctx.db.insert("masteryScores", {
      userId,
      subjectId,
      materialId,
      conceptKey: "cidr notation",
      conceptLabel: "CIDR Notation",
      correct: 4,
      attempts: 5,
      confidenceSum: 3.2,
      confidenceCount: 5,
      lastPracticedAt: now - 86400000,
    });
    await ctx.db.insert("masteryScores", {
      userId,
      subjectId,
      materialId,
      conceptKey: "ipv4 address structure",
      conceptLabel: "IPv4 Address Structure",
      correct: 6,
      attempts: 6,
      confidenceSum: 5.4,
      confidenceCount: 6,
      lastPracticedAt: now - 86400000,
    });

    // a few flashcards
    const cards: Array<[string, string, string, number]> = [
      ["How many usable hosts in a /26 subnet?", "62 — 2^6 − 2 (minus network + broadcast)", "Subnetting", now - 3600_000],
      ["What does block size mean?", "The gap between consecutive subnet network addresses: 256 − mask octet", "Subnetting", now],
      ["What is CIDR notation?", "A compact prefix-length form like /24 that replaces classful masks", "CIDR Notation", now],
      ["Why subtract 2 for usable hosts?", "The network address (all zeros) and broadcast address (all ones) can't be assigned", "Subnetting", now],
    ];
    for (const [front, back, label, due] of cards) {
      await ctx.db.insert("flashcards", {
        userId,
        materialId,
        front,
        back,
        conceptLabel: label,
        conceptKey: label.toLowerCase(),
        ease: 2.5,
        dueAt: due,
        reps: 0,
        lapses: 0,
        createdAt: now,
      });
    }

    // upcoming exam
    await ctx.db.insert("exams", {
      userId,
      subjectId,
      title: "Networks Midterm",
      examDate: now + 12 * 86400000,
      createdAt: now,
    });

    return materialId;
  },
});
