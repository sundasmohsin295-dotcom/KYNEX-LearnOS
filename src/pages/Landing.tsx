import { useState } from "react";
import { Link, Navigate } from "react-router";
import { motion, useScroll, useTransform } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Brain, CheckCircle2, FileText, Flame, GraduationCap,
  Link2, ListChecks, MessageSquareText, Network, Quote, Sparkles,
  Target, Trophy, Upload, Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Upload,
    title: "Upload anything",
    desc: "PDFs, YouTube, articles, slides, notes, images — even messy handwriting. STUDYOS reads it all and builds a structured learning kit from it.",
  },
  {
    icon: Brain,
    title: "Deep chapter analysis",
    desc: "Simple + deep explanations, ranked concepts, definitions, formulas, misconceptions, prerequisites and examiner-style questions — generated per material.",
  },
  {
    icon: Network,
    title: "See how ideas connect",
    desc: "Mind maps, flowcharts and knowledge graphs animate your material into visual structures, so relationships click instead of blur.",
  },
  {
    icon: Target,
    title: "Know your next move",
    desc: "One dominant mission, always. Targeted at your weakest concept, sized to fit in one sitting, and retired the moment you beat it.",
  },
  {
    icon: MessageSquareText,
    title: "A tutor with 10 modes",
    desc: "Socratic questioning, Feynman checks, teach-me loops, exam drills. It never dumps answers — it builds understanding.",
  },
  {
    icon: Flame,
    title: "Progress that rewards real learning",
    desc: "XP from correct answers and genuine mastery — never from screen time. Streaks encourage consistency, not guilt.",
  },
];

const PIPELINE = [
  { icon: Upload, label: "Upload" },
  { icon: FileText, label: "Read" },
  { icon: Brain, label: "Understand" },
  { icon: ListChecks, label: "Structure" },
  { icon: Zap, label: "Generate" },
  { icon: CheckCircle2, label: "Ready" },
];

const FAQS = [
  {
    q: "What can I upload?",
    a: "Website and article URLs, YouTube links, PDFs, Word documents, slide decks, plain text, pasted notes, images and screenshots. The AI extracts, structures and analyzes whatever you give it.",
  },
  {
    q: "How does the AI tutor work?",
    a: "Every conversation is grounded in your uploaded material. Pick a mode — Socratic, Feynman, Teach Me — and the tutor adapts: one probing question at a time, no answer dumps, difficulty that follows your performance.",
  },
  {
    q: "What is a mastery score?",
    a: "Each concept tracks your accuracy and confidence across practice. Above 85% with repeated evidence = mastered. Below 60% = flagged weak, and missions automatically target it.",
  },
  {
    q: "Is the gamification ethical?",
    a: "XP and rewards come from genuine learning events: correct answers, concept mastery, completed reviews. Miss a day and there's no shaming — just 'Welcome back, your progress is still here.'",
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
};

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 500], [0, 120]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0.2]);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* ---------- Nav ---------- */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/50 glass">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-chart-4 text-primary-foreground shadow-md">
              <GraduationCap className="size-5" />
            </div>
            <span className="font-display text-lg font-bold">STUDYOS <span className="text-primary">AI</span></span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild className="shadow-lg shadow-primary/25">
              <Link to="/auth">Start learning free</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section id="top" className="relative pt-36 pb-24 sm:pt-44">
        <div aria-hidden className="grid-bg absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-[700px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative mx-auto max-w-4xl px-4 text-center sm:px-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary"
          >
            <Sparkles className="size-3.5" />
            Your Student Learning Operating System
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl"
          >
            Upload anything.
            <br />
            <span className="text-gradient">Understand everything.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            STUDYOS AI turns any PDF, lecture, article or messy notes into a complete interactive
            learning experience — deep analysis, a personal tutor, adaptive practice, visual maps
            and mastery tracking that shows exactly what to do next.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button asChild size="lg" className="h-13 gap-2 rounded-2xl px-8 text-base shadow-xl shadow-primary/30">
              <Link to="/auth">
                <Zap className="size-4.5" /> Start learning free
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-13 gap-2 rounded-2xl px-8 text-base">
              <a href="#how">
                See how it works <BookOpen className="size-4.5" />
              </a>
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 text-xs text-muted-foreground"
          >
            No credit card. Guest mode available. Your first analysis takes ~30 seconds.
          </motion.p>

          {/* Hero mastery card */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="relative mx-auto mt-16 max-w-3xl"
          >
            <div className="rounded-3xl border border-border/70 bg-card/90 p-6 text-left shadow-2xl shadow-primary/10 backdrop-blur-xl sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Next Move</p>
                  <p className="mt-1 font-display text-lg font-bold">Practice 8 questions on Subnetting</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-xp/20 px-3 py-1 text-xs font-bold text-xp-foreground">
                  <Trophy className="size-3.5" /> +120 XP
                </span>
              </div>
              <div className="mt-4 rounded-xl bg-muted/70 p-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Why?</span> Your accuracy dropped to{" "}
                <span className="font-bold text-chart-5">46%</span> on this concept.
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { label: "Mastery", pct: 68, cls: "bg-primary" },
                  { label: "Confidence", pct: 61, cls: "bg-chart-4" },
                  { label: "Retention", pct: 83, cls: "bg-success" },
                ].map((b) => (
                  <div key={b.label}>
                    <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                      <span>{b.label}</span>
                      <span className="font-bold text-foreground">{b.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className={`h-full rounded-full ${b.cls}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${b.pct}%` }}
                        transition={{ duration: 1, delay: 0.8 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div aria-hidden className="absolute -right-6 -top-6 hidden rotate-6 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-xl sm:block">
              <p className="text-xs font-bold text-xp-foreground">🔥 7-day streak</p>
            </div>
            <div aria-hidden className="absolute -left-8 bottom-8 hidden -rotate-6 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-xl sm:block">
              <p className="text-xs font-bold text-success">✓ Concept mastered</p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ---------- Pipeline strip ---------- */}
      <section id="how" className="relative border-y border-border/60 bg-sidebar/50 py-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <motion.p {...fadeUp} transition={{ duration: 0.5 }} className="text-center text-xs font-bold uppercase tracking-[0.25em] text-primary">
            From raw content to mastery
          </motion.p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-0">
            {PIPELINE.map((step, i) => (
              <motion.div
                key={step.label}
                {...fadeUp}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="flex items-center"
              >
                <div className="flex flex-col items-center gap-2 px-3 sm:px-4">
                  <div className="grid size-12 place-items-center rounded-2xl border border-border/70 bg-card shadow-md">
                    <step.icon className="size-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold">{step.label}</span>
                </div>
                {i < PIPELINE.length - 1 && (
                  <div className="mb-5 hidden h-px w-8 bg-border sm:block" />
                )}
              </motion.div>
            ))}
          </div>
          <motion.p {...fadeUp} transition={{ duration: 0.5, delay: 0.4 }} className="mx-auto mt-8 max-w-xl text-center text-sm text-muted-foreground">
            If a step fails, you'll know — STUDYOS never pretends a broken upload was analyzed.
            Clear error states, honest results.
          </motion.p>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Everything in one OS</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Built like a game. Serious like a degree.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Curiosity → discovery → small win → progress → challenge → mastery → reward → return.
            </p>
          </motion.div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: (i % 3) * 0.1 }}
                className="card-lift group rounded-3xl border border-border/70 bg-card p-6"
              >
                <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-chart-4/15 text-primary transition-transform group-hover:scale-110">
                  <f.icon className="size-5.5" />
                </div>
                <h3 className="font-display text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Quote / identity ---------- */}
      <section className="border-y border-border/60 bg-gradient-to-br from-primary/5 via-transparent to-chart-4/5 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <Quote className="mx-auto size-8 text-primary/40" />
          <motion.blockquote {...fadeUp} transition={{ duration: 0.6 }} className="mt-6 font-display text-2xl font-bold leading-snug sm:text-3xl">
            "I don't study <span className="text-gradient">harder</span> anymore.
            <br /> I study <span className="text-gradient">exactly where I'm weak</span>."
          </motion.blockquote>
          <p className="mt-4 text-sm text-muted-foreground">— every student, eventually</p>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <motion.h2 {...fadeUp} transition={{ duration: 0.5 }} className="text-center font-display text-3xl font-extrabold tracking-tight">
            Questions, answered
          </motion.h2>
          <div className="mt-10 space-y-3">
            {FAQS.map((f, i) => (
              <motion.div key={f.q} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.06 }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full rounded-2xl border border-border/70 bg-card px-5 py-4 text-left transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold">{f.q}</span>
                    <span className={`text-primary transition-transform ${openFaq === i ? "rotate-45" : ""}`}>+</span>
                  </div>
                  {openFaq === i && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-3 overflow-hidden text-sm leading-relaxed text-muted-foreground"
                    >
                      {f.a}
                    </motion.p>
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="relative overflow-hidden py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />
        </div>
        <motion.div {...fadeUp} transition={{ duration: 0.6 }} className="relative mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
            Your next exam
            <br />
            starts <span className="text-gradient">tonight</span>.
          </h2>
          <p className="mt-5 text-muted-foreground">
            Upload one chapter. Let the OS find your gaps. Walk in ready.
          </p>
          <Button asChild size="lg" className="mt-8 h-13 gap-2 rounded-2xl px-10 text-base shadow-xl shadow-primary/30">
            <Link to="/auth">
              <Link2 className="size-4.5" /> Create your free account
            </Link>
          </Button>
        </motion.div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-chart-4 text-primary-foreground">
              <GraduationCap className="size-4" />
            </div>
            <span className="font-semibold text-foreground">STUDYOS AI</span>
          </div>
          <p>Upload anything. Understand everything. Master every subject.</p>
        </div>
      </footer>
    </div>
  );
}
