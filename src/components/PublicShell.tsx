import { useEffect } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KynexMark } from "@/components/AppShell";
import { applySeo, SEO } from "@/lib/seo";

/**
 * Shared chrome for public, indexable routes (legal pages, FAQ).
 * Solid surfaces, `font-data` eyebrows, no decorative icons, no gradients.
 * Applies per-route metadata and unloads it on unmount.
 */
export function PublicShell({
  title,
  path,
  description,
  children,
}: {
  title: string;
  path: string;
  description?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const cleanup = applySeo({ title, path, description });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metadata is static per route
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <KynexMark className="size-8" />
            <span className="font-display text-base font-bold tracking-tight">KYNEX</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/privacy">Privacy</Link>
            </Button>
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/terms">Terms</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Launch KYNEX</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-28 pb-20 sm:px-6">
        <p className="font-data text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          {path.replace("/", "").replace("-", " ")}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <div className="mt-10">{children}</div>
      </main>

      <footer className="border-t border-border/70 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p className="font-data text-xs">{SEO.keywords[0]}</p>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
            <Link to="/faq" className="hover:text-foreground">FAQ</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Legal-document section heading, kept deliberately plain. */
export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first-of-type:mt-0">
      <h2 className="font-display text-lg font-bold">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** Back-to-app helper used at the end of legal pages. */
export function BackToApp() {
  return (
    <p className="mt-12 border-t border-border/70 pt-6">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="size-3.5" /> Return to KYNEX
      </Link>
    </p>
  );
}
