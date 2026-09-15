import { useState } from "react";
import { Link, Navigate } from "react-router";
import { motion, useScroll, useTransform } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { KynexMark } from "@/components/AppShell";
import {
  ArrowRight, BookOpen, Brain, CheckCircle2, FileText, Fingerprint,
  Link2, ListChecks, MessageSquareText, Network, Quote, ScanSearch,
  Sparkles, Target, Upload, Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Fingerprint,
    title: "KYNEX Twin",
    desc: "A living model of your academic state — degree, GPA targets, mastery, weak concepts and study patterns — updated every time you learn.",
  },
  {
    icon: Target,
    title: "KYNEX Move",
    desc: "One highest-impact action, always. Chosen from your accuracy, mistakes and prerequisites — with the evidence shown, never a generic to-do list.",
  },
  {
    icon: Upload,
    title: "KYNEX Vault",
    desc: "PDFs, YouTube, articles, slides, notes, images. KYNEX reads it all and builds structured knowledge: concepts, questions, Recall cards, exam topics.",
  },
  {
    icon: MessageSquareText,
    title: "KYNEX Professor",
    desc: "An AI teaching system with real depth: STARTER to RESEARCH. Socratic questioning, Feynman checks and teach-me loops — never answer dumps.",
  },
  {
    icon: Brain,
    title: "Mastery Engine",
    desc: "Every answer updates a per-concept mastery model. KYNEX distinguishes what you know from what you've merely seen.",
  },
  {
    icon: ScanSearch,
    title: "Exam Radar",
    desc: "Preparation priority built from your mastery, recency and uploaded materials. Evidence-based — never a prediction of what will appear.",
  },
];

const PIPELINE = [
  { icon: Upload, label: "Vault" },
  { icon: FileText, label: "Read" },
  { icon: Brain, label: "Understand" },
  { icon: ListChecks, label: "Structure" },
  { icon: Target, label: "Next Move" },
  { icon: CheckCircle2, label: "Master" },
];

const FAQS = [
  {
    q: "What can I put in the Vault?",
    a: "Website and article URLs, YouTube links, PDFs, Word documents, slide decks, plain text, pasted notes, images and screenshots. KYNEX extracts, structures and analyzes whatever you give it — and tells you honestly when a format fails.",
  },
  {
    q: "How does the Professor work?",
    a: "Every conversation is grounded in your Vault material and your mastery data. Pick a mode and depth — from STARTER explanations to EXAM drills — and the Professor adapts: one probing question at a time, no answer dumps, difficulty that follows your performance.",
  },
  {
    q: "What is the Mastery Engine?",
    a: "Each concept tracks your accuracy and confidence across practice. Above 85% with repeated evidence = mastered. Below 60% = flagged weak, and Missions automatically target it. The same data powers Exam Radar and your Twin.",
  },
  {
    q: "Does KYNEX predict my exam?",
    a: "No. Exam Radar shows preparation priority from real evidence — your accuracy, recency and materials. It never claims a topic will appear. Where marks are estimated, they're clearly labelled as modelled or provisional.",
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
            <KynexMark className="size-9" />
            <span className="font-display text-lg font-extrabold tracking-tight">KYNEX</span>
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
            <Button asChild className="shadow-lg shadow-primary/25">
              <Link to="/auth">Launch KYNEX</Link>
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
            A new category: the Academic Intelligence OS
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl"
          >
            KYNEX
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.14 }}
            className="mt-3 font-display text-lg font-bold text-gradient sm:text-xl"
          >
            Your Academic Intelligence OS
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            KYNEX builds a living model of your academic journey and continuously determines the
            highest-impact action you should take next. Not another chatbot — an operating system
            that knows where you are, where you're going, and the gap between.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.26 }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button asChild size="lg" className="h-13 gap-2 rounded-2xl px-8 text-base shadow-xl shadow-primary/30">
              <Link to="/auth">
                <Zap className="size-4.5" /> Start learning free
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-13 gap-2 rounded-2xl px-8 text-base">
              <a href="#system">
                See how KYNEX works <ArrowRight className="size-4.5" />
              </a>
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="mt-4 text-xs text-muted-foreground"
          >
            No credit card. Guest mode available. Your first analysis takes ~30 seconds.
          </motion.p>

          {/* Hero Command Center card */}
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
                  <p className="mt-1 font-display text-lg font-bold">Fix: Subnetting</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">22 min mission</span>
              </div>
              <div className="mt-4 rounded-xl bg-muted/70 p-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Why:</span> 2 repeated mistakes ·{" "}
                <span className="font-bold text-chart-5">61%</span> recent accuracy · prerequisite
                for 3 upcoming topics.
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { label: "Mastery", pct: 68, cls: "bg-primary" },
                  { label: "Recall", pct: 58, cls: "bg-chart-4" },
                  { label: "Readiness", pct: 67, cls: "bg-success" },
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
              <p className="flex items-center gap-1.5 text-xs font-bold text-xp-foreground">
                <Fingerprint className="size-3.5" /> Twin updated
              </p>
            </div>
            <div aria-hidden className="absolute -left-8 bottom-8 hidden -rotate-6 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-xl sm:block">
              <p className="text-xs font-bold text-success">✓ Concept mastered</p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ---------- Core loop ---------- */}
      <section id="system" className="relative border-y border-border/60 bg-sidebar/50 py-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <motion.p {...fadeUp} transition={{ duration: 0.5 }} className="text-center text-xs font-bold uppercase tracking-[0.25em] text-primary">
            The KYNEX core loop
          </motion.p>
          <motion.h2 {...fadeUp} transition={{ duration: 0.5, delay: 0.05 }} className="mt-3 text-center font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            KNOW → UNDERSTAND → ACT → MASTER → ADVANCE
          </motion.h2>
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
            Student data feeds the Twin → gaps are detected → the highest-impact action is chosen →
            you execute → KYNEX measures the result → a smarter Next Move follows.
          </motion.p>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">One intelligence, many organs</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Serious like a degree. Fast like a game.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every part of KYNEX reads from the same academic model — so nothing you do is ever disconnected.
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
            "Finally, something actually <span className="text-gradient">understands my academic situation</span>."
          </motion.blockquote>
          <p className="mt-4 text-sm text-muted-foreground">— the moment the category clicks</p>
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
            KYNEX knows where you are.
            <br />
            <span className="text-gradient">Now find out what's next.</span>
          </h2>
          <p className="mt-5 text-muted-foreground">
            Add one chapter to the Vault. Let the OS find your gaps. Walk in ready.
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
            <KynexMark className="size-7" />
            <span className="font-semibold text-foreground">KYNEX</span>
          </div>
          <p>Your Academic Intelligence OS · KNOW → UNDERSTAND → ACT → MASTER → ADVANCE</p>
        </div>
      </footer>
    </div>
  );
}
