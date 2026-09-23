import { useState } from "react";
import { Link } from "react-router";
import { PublicShell } from "@/components/PublicShell";
import { Button } from "@/components/ui/button";

const FAQS = [
  {
    q: "Will the Professor make things up?",
    a: "It is built not to. Every answer is grounded in the material you uploaded. If your question falls outside that material, KYNEX runs a scope check before the AI is even called and returns an explicit out-of-scope notice instead of an invented answer. When the answer's source is general knowledge rather than your material, the response says so.",
  },
  {
    q: "How does the AI use my documents? Can a document change how I'm graded?",
    a: "Your documents are treated as untrusted data, nothing more. They are bounded, framed as context, and cannot override system rules, grading logic, or security controls. Prompt injection hidden inside an uploaded file is data, not instruction, and the application's own policies always win.",
  },
  {
    q: "Who can see my materials, scores and conversations?",
    a: "Only you. Every read and write runs a server-side ownership check against your authenticated session, so another account cannot reach your data even with a guessed or forged identifier. Foreign identifiers return 'not found' instead of confirming anything exists.",
  },
  {
    q: "How are marks and mastery calculated?",
    a: "From evidence only. Mastery per concept comes from your real quiz answers, weighted by difficulty and confidence calibration; passive reading never moves a score. Examiner marks are rubric-based, provisional estimates, always labelled as such and never presented as official university grades. GPA and CGPA math runs on the courses and credit hours you enter, on your chosen grading scale.",
  },
  {
    q: "Does KYNEX predict what will be on my exam?",
    a: "No. Exam Radar ranks preparation priority from your mastery, recency and uploaded materials. It never claims a topic will appear. When evidence is thin, it says 'unverified' instead of showing a confident fake number.",
  },
  {
    q: "What happens to my data if I delete something?",
    a: "It is really deleted. Deleting a conversation removes its messages. Deleting a material removes its extracted text and generated flashcards, and those flashcards' review history is removed too, so no orphaned evidence lingers. You can also revoke any active session instantly from the Security page.",
  },
  {
    q: "Do you track me or sell my data?",
    a: "No ads, no trackers, no selling of personal or academic data. Reliability monitoring is technical and content-free: latency samples, circuit-breaker state, sanitized crash messages with a correlation ID. No stack traces, no user content, no third-party analytics scripts.",
  },
  {
    q: "What does it cost?",
    a: "There is a free tier with honest limits on AI usage, shown on the plan page before you commit. Paid tiers add capacity. Quotas and rate limits are enforced server-side, so the numbers you see are the numbers that apply.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <PublicShell
      title="Frequently Asked Questions"
      path="/faq"
      description="How KYNEX grounding works, how your data is protected, how marks are calculated, and what the platform will never pretend to do."
    >
      <div className="space-y-3">
        {FAQS.map((f, i) => (
          <div key={f.q} className="rounded-xl border border-border bg-card">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-left"
              aria-expanded={open === i}
            >
              <span className="font-semibold">{f.q}</span>
              <span
                className={`font-data text-lg leading-none text-muted-foreground transition-transform ${open === i ? "rotate-45" : ""}`}
                aria-hidden
              >
                +
              </span>
            </button>
            {open === i && (
              <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-border bg-card p-6">
        <p className="font-display text-lg font-bold">Ready to try it on your own material?</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Add one chapter and KYNEX will map what you know, what you don't, and the single next
          action with the highest impact.
        </p>
        <Button asChild className="mt-4">
          <Link to="/auth">Create your free account</Link>
        </Button>
      </div>
    </PublicShell>
  );
}
