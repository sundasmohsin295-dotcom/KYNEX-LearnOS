import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { KynexMark } from "@/components/AppShell";
import { applySeo } from "@/lib/seo";
import { spring, TiltCard } from "@/lib/motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const FEATURES = [
  {
    title: "KYNEX Twin",
    desc: "A living model of your academic state: degree, GPA targets, mastery, weak concepts and study patterns, updated every time you learn.",
  },
  {
    title: "KYNEX Move",
    desc: "One highest-impact action, always. Chosen from your accuracy, mistakes and prerequisites, with the evidence shown. Never a generic to-do list.",
  },
  {
    title: "KYNEX Vault",
    desc: "PDFs, YouTube, articles, slides, notes, images. KYNEX reads it all and builds structured knowledge: concepts, questions, Recall cards, exam topics.",
  },
  {
    title: "KYNEX Professor",
    desc: "An AI teaching system with real depth, from STARTER to RESEARCH. Socratic questioning, Feynman checks and teach-me loops. Not an answer dump.",
  },
  {
    title: "Mastery Engine",
    desc: "Every answer updates a per-concept mastery model. KYNEX distinguishes what you know from what you have merely seen.",
  },
  {
    title: "Exam Radar",
    desc: "Preparation priority built from your mastery, recency and uploaded materials. Evidence-based, and never a prediction of what will appear.",
  },
];

const PIPELINE = ["Vault", "Read", "Understand", "Structure", "Next Move", "Master"];

const FAQS = [
  {
    q: "What can I put in the Vault?",
    a: "Website and article URLs, YouTube links, PDFs, Word documents, slide decks, plain text, pasted notes, images and screenshots. KYNEX extracts, structures and analyzes whatever you give it, and tells you honestly when a format fails.",
  },
  {
    q: "How does the Professor work?",
    a: "Every conversation is grounded in your Vault material and your mastery data. Pick a mode and depth, from STARTER explanations to EXAM drills, and the Professor adapts: one probing question at a time, no answer dumps, difficulty that follows your performance.",
  },
  {
    q: "What is the Mastery Engine?",
    a: "Each concept tracks your accuracy and confidence across practice. Above 85% with repeated evidence counts as mastered. Below 60% is flagged weak, and Missions automatically target it. The same data powers Exam Radar and your Twin.",
  },
  {
    q: "Does KYNEX predict my exam?",
    a: "No. Exam Radar shows preparation priority from real evidence: your accuracy, recency and materials. It never claims a topic will appear. Where marks are estimated, they are clearly labelled as modelled or provisional.",
  },
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Public, indexable marketing route: full metadata + JSON-LD.
  useEffect(() => applySeo({ title: "Your Academic Intelligence OS", path: "/" }), []);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------- Nav (solid, no glass) ---------- */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <KynexMark className="size-9" />
            <span className="font-display text-lg font-bold tracking-tight">KYNEX</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#system" className="transition-colors hover:text-foreground">The system</a>
            <a href="#features" className="transition-colors hover:text-foreground">Intelligence</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Launch KYNEX</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- Hero: typographic split, no parallax, no orbs ---------- */}
      <section id="top" className="border-b border-border/70 pt-32 pb-20 sm:pt-40">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.expressive}
          >
            <p className="font-data text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Academic Intelligence OS
            </p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Know where you stand. Then master it.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              KYNEX builds a living model of your academic journey and continuously determines the
              highest-impact action you should take next. It knows where you are, where you are
              going, and the gap between.
            </p>
            <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-lg px-8 text-base">
                <Link to="/auth">
                  Start learning free <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-lg px-8 text-base">
                <a href="#system">See how KYNEX works</a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card. Guest mode available. Your first analysis takes about 30 seconds.
            </p>
          </motion.div>

          {/* Product panel: the real interface idea, on a solid surface.
              TiltCard degrades to a static panel under reduced motion. */}
          <TiltCard
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.expressive}
            className="rounded-xl border border-border bg-card"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Next Move
              </p>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-data text-[11px] font-semibold text-primary">
                22 min
              </span>
            </div>
            <div className="px-5 py-5">
              <p className="font-display text-lg font-bold">Fix: Subnetting</p>
              <div className="mt-3 rounded-lg border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Why: </span>
                2 repeated mistakes,{" "}
                <span className="font-data font-semibold text-chart-5">61%</span> recent accuracy,
                prerequisite for 3 upcoming topics.
              </div>
              <div className="mt-5 space-y-3.5">
                {[
                  { label: "Mastery", pct: 68, cls: "bg-primary" },
                  { label: "Recall", pct: 58, cls: "bg-chart-4" },
                  { label: "Readiness", pct: 67, cls: "bg-success" },
                ].map((b) => (
                  <div key={b.label}>
                    <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                      <span>{b.label}</span>
                      <span className="font-data font-semibold text-foreground">{b.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-muted">
                      <motion.div
                        className={`h-full rounded-sm ${b.cls}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${b.pct}%` }}
                        transition={{ duration: 0.9, delay: 0.5 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 flex items-center gap-1.5 border-t border-border/60 pt-3.5 text-[11px] font-medium text-success">
                <CheckCircle2 className="size-3.5" /> Concept mastered: IP addressing
              </p>
            </div>
          </TiltCard>
        </div>
      </section>

      {/* ---------- Core loop: numbered, mono, no icon tiles ---------- */}
      <section id="system" className="border-b border-border/70 bg-sidebar/60 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <p className="font-data text-center text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            The KYNEX core loop
          </p>
          <h2 className="mt-3 text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
            KNOW → UNDERSTAND → ACT → MASTER → ADVANCE
          </h2>
          <ol className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {PIPELINE.map((label, i) => (
              <li key={label} className="bg-card px-4 py-5 text-center">
                <p className="font-data text-[11px] font-semibold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-1.5 text-sm font-semibold">{label}</p>
              </li>
            ))}
          </ol>
          <p className="mx-auto mt-8 max-w-xl text-center text-sm leading-relaxed text-muted-foreground">
            Student data feeds the Twin, gaps are detected, the highest-impact action is chosen, you
            execute, KYNEX measures the result, and a smarter Next Move follows.
          </p>
        </div>
      </section>

      {/* ---------- Features: spec-sheet rows, not icon cards ---------- */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="font-data text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              One intelligence, many organs
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Serious like a degree. Fast like a game.
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Every part of KYNEX reads from the same academic model, so nothing you do is ever
              disconnected.
            </p>
          </div>

          <div className="mt-12 divide-y divide-border border-y border-border">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="grid gap-1 py-5 sm:grid-cols-[4rem_14rem_1fr] sm:gap-6 sm:py-6">
                <p className="font-data text-sm font-semibold text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="font-display text-lg font-bold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="border-t border-border/70 bg-sidebar/60 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight">
            Questions, answered
          </h2>
          <div className="mt-10 space-y-3">
            {FAQS.map((f, i) => (
              <div key={f.q} className="rounded-xl border border-border bg-card">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-left"
                  aria-expanded={openFaq === i}
                >
                  <span className="font-semibold">{f.q}</span>
                  <span
                    className={`font-data text-lg leading-none text-muted-foreground transition-transform ${openFaq === i ? "rotate-45" : ""}`}
                    aria-hidden
                  >
                    +
                  </span>
                </button>
                {openFaq === i && (
                  <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Final CTA: plain, solid ---------- */}
      <section className="py-24">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            KYNEX knows where you are.
            <br />
            Now find out what is next.
          </h2>
          <p className="mt-5 text-muted-foreground">
            Add one chapter to the Vault. Let the OS find your gaps. Walk in ready.
          </p>
          <Button asChild size="lg" className="mt-8 h-12 rounded-lg px-10 text-base">
            <Link to="/auth">Create your free account</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/70 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <KynexMark className="size-7" />
            <span className="font-semibold text-foreground">KYNEX</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link to="/faq" className="hover:text-foreground">FAQ</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          </div>
          <p className="font-data text-xs">KNOW → UNDERSTAND → ACT → MASTER → ADVANCE</p>
        </div>
      </footer>
    </div>
  );
}
