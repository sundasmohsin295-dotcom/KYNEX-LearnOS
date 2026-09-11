"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createVlyIntegrations } from "@vly-ai/integrations";

const vly = createVlyIntegrations({
  deploymentToken: process.env.VLY_INTEGRATION_KEY,
  debug: false,
});

const MODEL = "gpt-4o-mini";

export interface LearningAnalysis {
  title: string;
  summary: string;
  deepExplanation: string;
  keyPoints: string[];
  concepts: { name: string; explanation: string; difficulty: "easy" | "medium" | "hard" }[];
  definitions: { term: string; definition: string }[];
  formulas: { name: string; expression: string; note: string }[];
  examples: { title: string; walkthrough: string }[];
  applications: string[];
  misconceptions: { wrong: string; why: string; correct: string }[];
  commonMistakes: string[];
  prerequisites: string[];
  causeEffect: { cause: string; effect: string }[];
  remember: string[];
  applySkills: string[];
  examinerQuestions: string[];
  practiceAreas: { name: string; reason: string }[];
}

/** One LLM call with retries and plain-error extraction. */
async function callAI(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens = 2400,
): Promise<string> {
  let lastErr = "Unknown AI error";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await vly.ai.completion({
        model: MODEL,
        messages,
        maxTokens,
        temperature: 0.4,
      });
      if (!res.success || !res.data?.choices?.[0]?.message?.content) {
        lastErr = res.error ?? "Empty AI response";
        continue;
      }
      return res.data.choices[0].message.content;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}

/** Parse JSON the model returns, tolerating ```json fences and trailing prose. */
function parseJson<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text) as T;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Deep chapter analysis
// ---------------------------------------------------------------------------

const ANALYSIS_SYSTEM = `You are STUDYOS AI — an expert academic analyst and tutor engine.
You receive study material (a chapter, article, transcript or notes) and produce a deep learning analysis.
Rules:
- Explain accurately using ONLY the provided material plus well-established background knowledge.
- Never invent exam frequency or statistics. Only reference exams when the material mentions them.
- Write for the specific subject level of the material.
- Respond with a single JSON object only. No markdown, no commentary.
JSON shape:
{
 "title": string (concise topic title, <=80 chars),
 "summary": string (beginner-friendly simple explanation, 120-200 words),
 "deepExplanation": string (technical deep explanation covering mechanisms, relationships, reasoning; 250-500 words),
 "keyPoints": string[5-8],
 "concepts": [{ "name": string, "explanation": string, "difficulty": "easy"|"medium"|"hard" }] (4-8 items),
 "definitions": [{ "term": string, "definition": string }] (3-8 items),
 "formulas": [{ "name": string, "expression": string, "note": string }] (0-8 items, [] if none),
 "examples": [{ "title": string, "walkthrough": string }] (2-4 items),
 "applications": string[] (2-5 real-world applications),
 "misconceptions": [{ "wrong": string, "why": string, "correct": string }] (2-4 items),
 "commonMistakes": string[2-5],
 "prerequisites": string[1-5],
 "causeEffect": [{ "cause": string, "effect": string }] (2-5 items),
 "remember": string[2-5] (must memorize),
 "applySkills": string[2-4] (must be able to apply),
 "examinerQuestions": string[3-5] (questions a teacher or examiner could ask),
 "practiceAreas": [{ "name": string, "reason": string }] (2-4 items)
}`;

/** Deep chapter analysis. Marks the material failed on any error — never fake success. */
export const analyzeMaterial = internalAction({
  args: { materialId: v.id("materials") },
  handler: async (ctx, { materialId }) => {
    try {
      const material = await ctx.runQuery(internal.materials.getInternal, { id: materialId });
      if (!material) throw new Error("Material not found");
      const chunks = await ctx.runQuery(internal.materials.getChunksInternal, { materialId });
      const text = chunks
        .slice(0, 12)
        .map((c: { text: string }) => c.text)
        .join("\n\n")
        .slice(0, 48000);
      if (text.trim().length < 40) {
        throw new Error("Extracted content was too short to analyze.");
      }

      await ctx.runMutation(internal.materials.setStageInternal, { id: materialId, stage: "reading" });
      await sleep(500);
      await ctx.runMutation(internal.materials.setStageInternal, { id: materialId, stage: "understanding" });
      await sleep(500);
      await ctx.runMutation(internal.materials.setStageInternal, { id: materialId, stage: "structuring" });

      const res = await vly.ai.completion({
        model: MODEL,
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM },
          { role: "user", content: `Material:\n\n${text}` },
        ],
        maxTokens: 3500,
        temperature: 0.3,
      });
      if (!res.success || !res.data?.choices?.[0]?.message?.content) {
        throw new Error(res.error ?? "The AI service returned an empty response.");
      }
      const analysis = parseJson<LearningAnalysis>(res.data.choices[0].message.content);
      if (!analysis.summary || !Array.isArray(analysis.concepts) || analysis.concepts.length === 0) {
        throw new Error("The AI analysis was incomplete. Please try again.");
      }

      await ctx.runMutation(internal.materials.setStageInternal, { id: materialId, stage: "generating" });
      await sleep(400);
      await ctx.runMutation(internal.materials.completeInternal, { id: materialId, analysis });
      if (analysis.title) {
        await ctx.runMutation(internal.materials.setSubjectInternal, {
          id: materialId,
          subjectName: guessSubject(material.title, analysis),
        });
      }
      await ctx.runMutation(internal.materials.awardXpInternal, {
        amount: 60,
        reason: `Analyzed "${analysis.title}"`,
      });
      await ctx.runMutation(internal.materials.generateMissionInternal, {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.materials.markFailedInternal, { id: materialId, error: msg });
    }
  },
});

function guessSubject(materialTitle: string, analysis: LearningAnalysis): string {
  const hay = `${materialTitle} ${analysis.title}`.toLowerCase();
  if (/ip |subnet|network|tcp|dns|router/.test(hay)) return "Computer Networks";
  if (/calculus|integral|derivative|matrix|algebra/.test(hay)) return "Mathematics";
  if (/cell|enzyme|dna|photosynthesis|organism/.test(hay)) return "Biology";
  if (/atom|molecule|reaction|acid|thermodynamic/.test(hay)) return "Chemistry";
  if (/market|demand|supply|inflation|gdp/.test(hay)) return "Economics";
  if (/histor|war|revolution|empire|treaty/.test(hay)) return "History";
  return analysis.title.split(/[—:-]/)[0].trim().slice(0, 40) || "General Studies";
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const CHAT_SYSTEM = `You are STUDYOS AI, a warm, structured AI tutor inside a student learning OS.
You always answer in the context of the student's selected learning material when one is provided.
Guidelines:
- Use markdown headings, short paragraphs and bullet lists. Never produce walls of text.
- Build from simple intuition to precise detail.
- Use concrete examples and analogies.
- When the student seems stuck, offer the prerequisite concept before the full answer.
- Be encouraging but honest about gaps.

Mode instructions (follow the mode the user picked):
- explain: clear structured explanation.
- example: give a worked example, then a short takeaway.
- why: explain the underlying mechanism and reasoning.
- compare: show differences in a compact comparison (table or paired bullets).
- quiz: produce ONE multiple-choice question (4 options A-D) on the material. Put the correct answer and a one-sentence explanation at the end, clearly marked "Answer:".
- socratic: reply with one probing question at a time; never dump full explanations.
- feynman: ask the student to explain the concept in their own words, then critique gaps kindly and briefly.
- teach: TUTOR LOOP — teach ONE small concept step, then ask a short check question and STOP. Wait for the student's answer. Do not reveal the check-question answer until the student responds. Evaluate their answer, correct mistakes, then give the next step, increasing difficulty gradually.
- zero: teach from absolute zero, assume no prior knowledge, define every term.
- diagnose: identify what the student needs to understand BEFORE this topic. Ask what they already know first.
- application: give a realistic scenario where the concept is used and walk through it.`;

export const chatInternal = internalAction({
  args: {
    conversationId: v.id("conversations"),
    materialId: v.optional(v.id("materials")),
    mode: v.string(),
    history: v.array(v.object({ role: v.string(), content: v.string() })),
  },
  handler: async (ctx, { conversationId, materialId, mode, history }) => {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: CHAT_SYSTEM },
    ];
    if (materialId) {
      const chunks = await ctx.runQuery(internal.materials.getChunksInternal, { materialId });
      const text = chunks
        .slice(0, 6)
        .map((c: { text: string }) => c.text)
        .join("\n\n")
        .slice(0, 14000);
      if (text) {
        messages.push({
          role: "system",
          content: `The student is studying this material:\n\n${text}`,
        });
      }
    }
    for (const m of history.slice(-16)) {
      const role = m.role === "assistant" ? "assistant" : "user";
      messages.push({ role, content: m.content });
    }
    messages.push({ role: "system", content: `Active mode: ${mode}.` });

    try {
      const reply = await callAI(messages, 1600);
      await ctx.runMutation(internal.learning.appendAssistantInternal, {
        conversationId,
        content: reply,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.learning.appendAssistantInternal, {
        conversationId,
        content: `⚠️ Sorry — the AI service failed to respond (${msg}). Please try again.`,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Quiz generation (grading is deterministic in learning.ts)
// ---------------------------------------------------------------------------

export const quizInternal = internalAction({
  args: {
    attemptId: v.id("quizAttempts"),
    materialId: v.id("materials"),
    conceptKey: v.optional(v.string()),
    count: v.number(),
    difficulty: v.string(),
  },
  handler: async (ctx, { attemptId, materialId, conceptKey, count, difficulty }) => {
    try {
      const material = await ctx.runQuery(internal.materials.getInternal, { id: materialId });
      if (!material) throw new Error("Material not found");
      const chunks = await ctx.runQuery(internal.materials.getChunksInternal, { materialId });
      const text = chunks
        .slice(0, 8)
        .map((c: { text: string }) => c.text)
        .join("\n\n")
        .slice(0, 20000);

      const conceptLine = conceptKey
        ? `Focus all questions on the concept "${conceptKey}".`
        : `Cover the key concepts of the material evenly.`;
      const difficultyLine =
        difficulty === "adaptive"
          ? "Order questions from easy to hard."
          : `All questions should be ${difficulty} difficulty.`;

      const res = await vly.ai.completion({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You are an exam writer. Write ${count} multiple-choice questions from the material.
${conceptLine}
${difficultyLine}
Rules:
- Exactly 4 options each; exactly one clearly correct.
- Test understanding and application, not trivia.
- Include a one-sentence explanation of the correct answer and one-line reasons why each wrong option is wrong.
- concept field = the concept name being tested.
- Respond with a single JSON array only.
JSON shape: [{ "question": string, "options": string[4], "correctIndex": 0-3, "explanation": string, "whyWrong": string[3], "concept": string, "difficulty": "easy"|"medium"|"hard", "type": "application"|"recall"|"analysis" }]`,
          },
          { role: "user", content: text },
        ],
        maxTokens: 3000,
        temperature: 0.5,
      });
      if (!res.success || !res.data?.choices?.[0]?.message?.content) {
        throw new Error(res.error ?? "Empty AI response");
      }
      const parsed = parseJson<
        Array<{
          question: string;
          options: string[];
          correctIndex: number;
          explanation: string;
          whyWrong: string[];
          concept: string;
          difficulty: string;
          type: string;
        }>
      >(res.data.choices[0].message.content);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("No questions generated");

      const questions = parsed
        .slice(0, count)
        .map((q) => ({
          question: String(q.question ?? ""),
          options: (q.options ?? []).map(String).slice(0, 4),
          correctIndex: Number(q.correctIndex ?? 0),
          explanation: String(q.explanation ?? ""),
          whyWrong: (q.whyWrong ?? []).map(String).slice(0, 3),
          concept: String(q.concept ?? material.title),
          difficulty: (["easy", "medium", "hard"].includes(q.difficulty)
            ? q.difficulty
            : "medium") as "easy" | "medium" | "hard",
          type: String(q.type ?? "recall"),
        }))
        .filter((q) => q.question && q.options.length === 4);

      if (questions.length === 0) throw new Error("Generated questions were invalid");
      await ctx.runMutation(internal.learning.activateInternal, { attemptId, questions });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.learning.failInternal, { attemptId, error: msg });
    }
  },
});

// ---------------------------------------------------------------------------
// Study session logging (unused by the client directly, kept for parity)
// ---------------------------------------------------------------------------

