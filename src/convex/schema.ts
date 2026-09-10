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

    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove
      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ---- STUDYOS AI ----

    profiles: defineTable({
      userId: v.id("users"),
      name: v.string(),
      educationLevel: v.optional(v.string()), // e.g. "Undergraduate — Year 2"
      institution: v.optional(v.string()),
      studyGoal: v.optional(v.string()),
      onboardingComplete: v.boolean(),
      seededDemo: v.boolean(), // has demo/sample content been added
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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
