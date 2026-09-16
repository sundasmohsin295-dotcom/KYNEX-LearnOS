import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const materialKindValidator = v.union(
  v.literal("text"), // pasted / typed content
  v.literal("url"), // website / article / lecture page
  v.literal("youtube"),
  v.literal("pdf"),
  v.literal("docx"),
  v.literal("pptx"),
  v.literal("txt"),
  v.literal("image"),
  v.literal("audio"),
  v.literal("csv"),
  v.literal("code"),
);

export const materialStatusValidator = v.union(
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

export const analysisValidator = v.object({
  title: v.optional(v.string()),
  // A. simple explanation
  summary: v.string(),
  // B. deep explanation
  deepExplanation: v.optional(v.string()),
  keyPoints: v.array(v.string()),
  concepts: v.array(
    v.object({
      name: v.string(),
      explanation: v.string(),
      difficulty: v.union(
        v.literal("easy"),
        v.literal("medium"),
        v.literal("hard"),
      ),
    }),
  ),
  definitions: v.optional(
    v.array(v.object({ term: v.string(), definition: v.string() })),
  ),
  formulas: v.optional(
    v.array(
      v.object({ name: v.string(), expression: v.string(), note: v.string() }),
    ),
  ),
  examples: v.optional(
    v.array(v.object({ title: v.string(), walkthrough: v.string() })),
  ),
  applications: v.optional(v.array(v.string())),
  misconceptions: v.array(
    v.object({ wrong: v.string(), why: v.string(), correct: v.string() }),
  ),
  commonMistakes: v.array(v.string()),
  prerequisites: v.array(v.string()),
  causeEffect: v.optional(
    v.array(v.object({ cause: v.string(), effect: v.string() })),
  ),
  remember: v.optional(v.array(v.string())),
  applySkills: v.optional(v.array(v.string())),
  examinerQuestions: v.optional(v.array(v.string())),
  practiceAreas: v.array(v.object({ name: v.string(), reason: v.string() })),
  model: v.string(),
  analyzedAt: v.number(),
});

export const analysisValidatorNullable = v.optional(analysisValidator);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // Server-side session management. The default auth table is REPLACED
    // with an identical field set plus a raw expiration index so the app can
    // (a) list a user's active sessions and (b) purge expired rows. The
    // original "userId" index is preserved exactly as convex-auth defines it
    // so auth internals keep working unchanged.
    authSessions: defineTable({
      userId: v.id("users"),
      expirationTime: v.number(),
    })
      // Convex appends _creationTime automatically — it must not be listed.
      .index("userId", ["userId"])
      .index("by_expiration", ["expirationTime"]),

    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove
      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ---- KYNEX ----

    profiles: defineTable({
      userId: v.id("users"),
      name: v.string(),
      educationLevel: v.optional(v.string()), // e.g. "Undergraduate — Year 2"
      institution: v.optional(v.string()),
      studyGoal: v.optional(v.string()),
      onboardingComplete: v.boolean(),
      seededDemo: v.boolean(), // has demo/sample content been added
      // ---- KYNEX academic identity (Twin) ----
      degree: v.optional(v.string()),
      department: v.optional(v.string()),
      university: v.optional(v.string()),
      semester: v.optional(v.number()),
      creditHours: v.optional(v.number()),
      gradingScale: v.optional(v.union(
        v.literal("4.0"),
        v.literal("5.0"),
        v.literal("custom"),
      )),
      // Custom university grading scale: [{min, point}] percent→points bands.
      // Only set through gpa.setScale which validates + sanitizes.
      customBands: v.optional(v.array(
        v.object({ min: v.number(), point: v.number() }),
      )),
      currentGpa: v.optional(v.number()),
      currentCgpa: v.optional(v.number()),
      targetGpa: v.optional(v.number()),
      targetCgpa: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    gameProfiles: defineTable({
      userId: v.id("users"),
      xp: v.number(),
      level: v.number(),
      streakCount: v.number(),
      longestStreak: v.number(),
      lastStudyDay: v.optional(v.string()), // "YYYY-MM-DD" (UTC)
      goalMinutesPerDay: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    subjects: defineTable({
      userId: v.id("users"),
      name: v.string(),
      color: v.optional(v.string()),
    }).index("by_user", ["userId"]),

    materials: defineTable({
      userId: v.id("users"),
      subjectId: v.optional(v.id("subjects")),
      title: v.string(),
      kind: materialKindValidator,
      sourceUrl: v.optional(v.string()),
      status: materialStatusValidator,
      error: v.optional(v.string()),
      charCount: v.number(),
      wordCount: v.number(),
      chunkCount: v.number(),
      analysis: analysisValidatorNullable,
      processingStage: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_created", ["userId", "createdAt"]),

    // plain-text chunks used for retrieval when chatting / generating quizzes
    materialChunks: defineTable({
      userId: v.id("users"),
      materialId: v.id("materials"),
      idx: v.number(),
      text: v.string(),
    }).index("by_material", ["materialId"]),

    conversations: defineTable({
      userId: v.id("users"),
      materialId: v.optional(v.id("materials")),
      title: v.string(),
      starred: v.boolean(),
      archived: v.boolean(),
      updatedAt: v.number(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_updated", ["userId", "updatedAt"])
      .index("by_material", ["materialId"]),

    messages: defineTable({
      userId: v.id("users"),
      conversationId: v.id("conversations"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      createdAt: v.number(),
    })
      .index("by_conversation", ["conversationId"])
      .index("by_conversation_created", ["conversationId", "createdAt"]),

    quizAttempts: defineTable({
      userId: v.id("users"),
      materialId: v.id("materials"),
      conversationId: v.optional(v.id("conversations")),
      mode: v.union(v.literal("diagnostic"), v.literal("practice")),
      status: v.union(
        v.literal("generating"),
        v.literal("active"),
        v.literal("completed"),
        v.literal("failed"),
      ),
      error: v.optional(v.string()),
      questions: v.array(
        v.object({
          question: v.string(),
          options: v.array(v.string()),
          correctIndex: v.number(),
          explanation: v.string(),
          whyWrong: v.array(v.string()),
          concept: v.string(),
          difficulty: v.union(
            v.literal("easy"),
            v.literal("medium"),
            v.literal("hard"),
          ),
          type: v.string(),
        }),
      ),
      // answers[idx] = { selectedIndex, confidence, correct }
      answers: v.array(
        v.object({
          selectedIndex: v.number(),
          confidence: v.string(),
          correct: v.boolean(),
        }),
      ),
      conceptFocus: v.optional(v.string()),
      missionId: v.optional(v.id("missions")),
      // ---- Exam Simulator ----
      examMode: v.optional(v.boolean()),
      examDurationSec: v.optional(v.number()), // total time budget
      examStartedAt: v.optional(v.number()), // server-side clock start
      examEndsAt: v.optional(v.number()), // server-side deadline
      // flags[i] = true → question i marked for review
      examFlags: v.optional(v.array(v.boolean())),
      // per-question seconds spent (parallel to answers; -1 = unanswered)
      examTiming: v.optional(v.array(v.number())),
      negativeMarking: v.optional(v.boolean()),
      examSubmitted: v.optional(v.boolean()),
      createdAt: v.number(),
      completedAt: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_user_created", ["userId", "createdAt"])
      .index("by_material", ["materialId"]),

    // one row per (user, subjectId|null, conceptKey) — conceptKey is
    // lowercase-normalized concept name so scores merge across materials
    masteryScores: defineTable({
      userId: v.id("users"),
      subjectId: v.optional(v.id("subjects")),
      materialId: v.optional(v.id("materials")),
      conceptKey: v.string(),
      conceptLabel: v.string(),
      correct: v.number(),
      attempts: v.number(),
      confidenceSum: v.number(), // sum of confidence weights 0..1
      confidenceCount: v.number(),
      retentionDecay: v.optional(v.number()), // 0..1, decays over time
      lastPracticedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_material", ["userId", "materialId"]),

    studySessions: defineTable({
      userId: v.id("users"),
      minutes: v.number(),
      kind: v.string(), // "chat" | "quiz" | "material" | "flashcards"
      createdAt: v.number(),
    }).index("by_user_created", ["userId", "createdAt"]),

    // ---- gamification ----

    missions: defineTable({
      userId: v.id("users"),
      title: v.string(),
      description: v.string(),
      kind: v.union(
        v.literal("practice"),
        v.literal("review"),
        v.literal("learn"),
        v.literal("fix_gap"),
        v.literal("master"),
      ),
      targetCount: v.number(),
      progress: v.number(),
      xpReward: v.number(),
      conceptKey: v.optional(v.string()),
      conceptLabel: v.optional(v.string()),
      materialId: v.optional(v.id("materials")),
      status: v.union(v.literal("active"), v.literal("completed")),
      createdAt: v.number(),
      completedAt: v.optional(v.number()),
    })
      .index("by_user_status", ["userId", "status"])
      .index("by_user_created", ["userId", "createdAt"]),

    // ---- KYNEX Mission Engine: durable per-mission tasks ----
    // One row per task; the parent mission stays in `missions` (shared with
    // the quiz/XP loop). Tasks are the structured learning sequence a
    // mission walks through and hold the real per-step evidence.
    missionTasks: defineTable({
      userId: v.id("users"), // denormalized ownership + index
      missionId: v.id("missions"),
      order: v.number(),
      kind: v.union(
        v.literal("explain"), // quick explanation / example (read step)
        v.literal("recall"), // retrieval prompt answered from memory
        v.literal("practice"), // MCQ-style check with options
        v.literal("challenge"), // final harder application step
      ),
      title: v.string(),
      prompt: v.string(),
      // For practice/challenge steps: options + correct index
      options: v.optional(v.array(v.string())),
      correctIndex: v.optional(v.number()),
      explanation: v.optional(v.string()),
      hint: v.optional(v.string()),
      // Student's recorded outcome
      status: v.union(
        v.literal("pending"),
        v.literal("correct"),
        v.literal("partial"),
        v.literal("incorrect"),
        v.literal("skipped"),
      ),
      confidence: v.optional(v.union(
        v.literal("sure"),
        v.literal("probably"),
        v.literal("guess"),
      )),
      secondsSpent: v.optional(v.number()),
      answeredAt: v.optional(v.number()),
    })
      .index("by_mission", ["missionId"])
      .index("by_user", ["userId"]),

    // ---- Study Planner: one persisted plan per (user, day) ----
    // `blocks` are ordered study blocks the student can complete, skip or
    // reschedule. Built from the same intelligence inputs as NEXT MOVE.
    studyPlans: defineTable({
      userId: v.id("users"),
      dayKey: v.string(), // "YYYY-MM-DD" (UTC) — one plan per day
      examDate: v.optional(v.number()),
      blocks: v.array(
        v.object({
          id: v.string(),
          kind: v.union(
            v.literal("practice"),
            v.literal("review"),
            v.literal("recall"),
            v.literal("fix"),
          ),
          title: v.string(),
          minutes: v.number(),
          status: v.union(
            v.literal("pending"),
            v.literal("completed"),
            v.literal("skipped"),
          ),
          conceptKey: v.optional(v.string()),
          materialId: v.optional(v.id("materials")),
        }),
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user_day", ["userId", "dayKey"]),

    xpEvents: defineTable({
      userId: v.id("users"),
      amount: v.number(),
      reason: v.string(),
      createdAt: v.number(),
    }).index("by_user_created", ["userId", "createdAt"]),

    achievements: defineTable({
      userId: v.id("users"),
      key: v.string(),
      earnedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_key", ["userId", "key"]),

    exams: defineTable({
      userId: v.id("users"),
      title: v.string(),
      subjectId: v.optional(v.id("subjects")),
      examDate: v.number(),
      createdAt: v.number(),
    }).index("by_user_date", ["userId", "examDate"]),

    // ---- GPA / CGPA Lab ----

    // One row per user semester. Courses live in gpaCourses (child rows).
    gpaSemesters: defineTable({
      userId: v.id("users"),
      name: v.string(), // "Semester 1", "Fall 2025", "Year 2 · Sem B"
      order: v.number(), // sort order; new semesters append
      status: v.union(v.literal("completed"), v.literal("in_progress")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_order", ["userId", "order"]),

    gpaCourses: defineTable({
      userId: v.id("users"), // denormalized ownership + index; verified server-side
      semesterId: v.id("gpaSemesters"),
      name: v.string(),
      code: v.optional(v.string()),
      creditHours: v.number(),
      gradePoint: v.optional(v.number()), // null while in progress / ungraded
    })
      .index("by_semester", ["semesterId"])
      .index("by_user", ["userId"]),

    // ---- Mistake Bank: durable per-mistake records from real quiz answers ----
    mistakes: defineTable({
      userId: v.id("users"),
      materialId: v.optional(v.id("materials")),
      attemptId: v.id("quizAttempts"),
      questionIndex: v.number(),
      question: v.string(),
      yourAnswer: v.string(), // option text
      correctAnswer: v.string(), // option text
      explanation: v.string(),
      conceptKey: v.string(),
      conceptLabel: v.string(),
      // classification: derives from question type + confidence + difficulty
      category: v.union(
        v.literal("conceptual"),
        v.literal("calculation"),
        v.literal("careless"),
        v.literal("memory"),
        v.literal("misreading"),
        v.literal("time_pressure"),
        v.literal("reasoning"),
        v.literal("application"),
      ),
      difficulty: v.union(
        v.literal("easy"),
        v.literal("medium"),
        v.literal("hard"),
      ),
      timesMissed: v.number(), // increments when the same (user, concept, question-ish) mistake repeats
      resolved: v.boolean(), // set when the concept is later answered correctly in a later quiz
      resolvedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_resolved", ["userId", "resolved"])
      .index("by_user_concept", ["userId", "conceptKey"]),

    // ---- flashcards / spaced repetition ----

    flashcards: defineTable({
      userId: v.id("users"),
      materialId: v.optional(v.id("materials")),
      conceptKey: v.optional(v.string()),
      conceptLabel: v.optional(v.string()),
      front: v.string(),
      back: v.string(),
      ease: v.number(), // 1.3 .. 3.0
      dueAt: v.number(),
      reps: v.number(),
      lapses: v.number(),
      createdAt: v.number(),
    })
      .index("by_user_due", ["userId", "dueAt"])
      .index("by_material", ["materialId"]),

    reviews: defineTable({
      userId: v.id("users"),
      flashcardId: v.id("flashcards"),
      grade: v.union(
        v.literal("again"),
        v.literal("hard"),
        v.literal("good"),
        v.literal("easy"),
      ),
      reviewedAt: v.number(),
    }).index("by_user_reviewed", ["userId", "reviewedAt"]),

    // ---- security ----

    // Fixed-window server-side rate limiting for expensive/sensitive ops.
    // One row per (key) — key embeds userId + operation.
    rateLimits: defineTable({
      key: v.string(),
      windowStart: v.number(),
      count: v.number(),
    }).index("by_key", ["key"]),

    // Security-relevant event log (deletions, rate-limit hits, auth-adjacent
    // failures). Contains NO personal content — only actor id + action type.
    // Not exposed through any public query: read access is ops-only.
    auditLogs: defineTable({
      userId: v.optional(v.id("users")),
      action: v.string(),
      detail: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_action_time", ["action", "createdAt"]),

    // Server-AUTHORITATIVE plan + AI quota state. The client never sends or
    // caches any of this — every premium check reads it here, fail closed.
    plans: defineTable({
      userId: v.id("users"),
      plan: v.union(v.literal("free"), v.literal("pro")),
      // Set only by billing webhooks / ops. Never by client input.
      status: v.optional(v.string()), // e.g. "active", "past_due", "canceled"
      periodEnd: v.optional(v.number()),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // ---- Referral engine (real codes, one-shot validation, real rewards) ----
    referrals: defineTable({
      // The referrer (owner of the code). Never derived from client input.
      referrerId: v.id("users"),
      // The invited friend — null until a NEW user redeems the code.
      refereeId: v.optional(v.id("users")),
      code: v.string(), // KYNEX-XXXXX, unique
      // Reward ledger — granted only by the server on first redemption.
      referrerRewarded: v.boolean(),
      refereeRewarded: v.boolean(),
      createdAt: v.number(),
      redeemedAt: v.optional(v.number()),
    })
      .index("by_referrer", ["referrerId"])
      .index("by_referee", ["refereeId"])
      .index("by_code", ["code"]),

    // ---- Notification intelligence: useful, limited, dismissible ----
    nudges: defineTable({
      userId: v.id("users"),
      kind: v.string(), // e.g. "review_due", "exam_gap", "momentum"
      body: v.string(), // Human message with a REAL number in it.
      targetRoute: v.string(), // deep link to the exact screen
      // Deduplication: same kind + ref within 3 days won't repeat.
      ref: v.string(),
      createdAt: v.number(),
      dismissedAt: v.optional(v.number()),
    })
      .index("by_user_created", ["userId", "createdAt"]),

    // Daily AI usage for denial-of-wallet protection. Reset is computed from
    // dayKey (UTC "YYYY-MM-DD") — no cron needed, no drift.
    aiUsageDaily: defineTable({
      userId: v.id("users"),
      dayKey: v.string(), // "YYYY-MM-DD" (UTC)
      analysisCount: v.number(),
      chatCount: v.number(),
      quizCount: v.number(),
      updatedAt: v.number(),
    }).index("by_user_day", ["userId", "dayKey"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
