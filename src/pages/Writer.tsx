import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate, useParams } from "react-router";
import { motion } from "framer-motion";
import {
  Check, FileText, Loader2, PenLine, Quote, Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, PageHeader } from "@/components/AppShell";
import { LockedSkeleton } from "@/components/LoadLock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

type WriterDoc = {
  _id: string;
  title: string;
  content: string;
  materialId?: string;
  wordGoal?: number;
  updatedAt: number;
};

type Citation = {
  _id: string;
  paragraphIndex: number;
  ord: number;
  sourceText: string;
  locator?: string;
};

function countWords(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

function paragraphsOf(content: string) {
  return content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

/**
 * CITATION-AWARE WRITER — a centered editorial surface where every claim can
 * be anchored to the exact passage of a Vault material. Word counters render
 * in IBM Plex Mono (font-data); auto-save is debounced and quiet.
 */
export default function Writer() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { isLoading, isAuthenticated } = useAuth();
  const docs = useQuery(api.writer.list) as WriterDoc[] | undefined;

  // Conditional queries: the function reference must always be a real
  // FunctionReference, so we guard with an unconditional query of the same
  // hook and rely on args === "skip" to pause. Typing is asserted because
  // the generated api unions don't narrow per-route.
  const writerApi = api.writer as unknown as {
    get: (args: { id: Id<"writerDocs"> }) => WriterDoc | null;
    listCitations: (args: { docId: Id<"writerDocs"> }) => Citation[];
  };
  const doc = useQuery(
    api.writer.get as unknown as typeof api.writer.get,
    id ? { id: id as Id<"writerDocs"> } : ("skip" as unknown as { id: Id<"writerDocs"> }),
  ) as WriterDoc | null | undefined;
  const citations = useQuery(
    writerApi.listCitations as unknown as typeof api.writer.list,
    id
      ? ({ docId: id } as unknown as Record<string, never>)
      : ("skip" as unknown as Record<string, never>),
  ) as Citation[] | undefined;
  void writerApi;

  const createDoc = useMutation(api.writer.create);
  const updateDoc = useMutation(api.writer.update);
  const removeDoc = useMutation(api.writer.remove);
  const addCitation = useMutation(api.writer.addCitation);
  const removeCitation = useMutation(api.writer.removeCitation);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedParagraph, setSelectedParagraph] = useState<number | null>(null);
  const [citeSource, setCiteSource] = useState("");
  const [citeLocator, setCiteLocator] = useState("");
  const dirtyRef = useRef(false);

  // Hydrate the editor when the doc arrives (and only when it changes).
  useEffect(() => {
    if (doc) {
      setTitle(doc.title);
      setContent(doc.content);
      dirtyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?._id]);

  const debouncedTitle = useDebouncedValue(title, 800);
  const debouncedContent = useDebouncedValue(content, 800);

  // Quiet auto-save: only after the doc exists and the user actually edited.
  useEffect(() => {
    if (!id || !doc) return;
    if (!dirtyRef.current) return;
    if (debouncedTitle === doc.title && debouncedContent === doc.content) return;
    let cancelled = false;
    setSaving(true);
    void (async () => {
      try {
        await updateDoc({
          id: id as Id<"writerDocs">,
          title: debouncedTitle,
          content: debouncedContent,
        });
        if (!cancelled) {
          dirtyRef.current = false;
          setSavedAt(Date.now());
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Auto-save failed — your text is kept locally.");
        }
      } finally {
        if (!cancelled) setSaving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedTitle, debouncedContent, id, doc, updateDoc]);

  const paragraphs = useMemo(() => paragraphsOf(content), [content]);
  const words = countWords(content);
  const goalPct = doc?.wordGoal
    ? Math.min(100, Math.round((words / doc.wordGoal) * 100))
    : null;

  const handleCreate = useCallback(async () => {
    setError(null);
    try {
      const newId = await createDoc({
        title: title.trim() || "Untitled document",
        content,
      });
      navigate(`/writer/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the document.");
    }
  }, [createDoc, title, content, navigate]);

  const handleCite = useCallback(async () => {
    if (selectedParagraph == null || !id) return;
    setError(null);
    try {
      await addCitation({
        docId: id as Id<"writerDocs">,
        paragraphIndex: selectedParagraph,
        sourceText: citeSource,
        locator: citeLocator || undefined,
      });
      setCiteSource("");
      setCiteLocator("");
      setSelectedParagraph(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't attach the citation.");
    }
  }, [addCitation, citeSource, citeLocator, id, selectedParagraph]);

  const citationsByParagraph = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of citations ?? []) {
      map.set(c.paragraphIndex, (map.get(c.paragraphIndex) ?? 0) + 1);
    }
    return map;
  }, [citations]);

  if (isLoading) {
    return (
      <AppShell>
        <LockedSkeleton height="420px" label="Loading writer" />
      </AppShell>
    );
  }
  if (!isAuthenticated) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md kynex-glass spectrum-border rounded-3xl p-10 text-center">
          <p className="font-display text-xl font-bold">Sign in to write with sources</p>
          <Button className="mt-5" onClick={() => navigate("/auth?returnTo=/writer")}>
            Sign in
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader eyebrow="Citation Writer · Evidence-first drafting" title="Writer">
        <div className="flex items-center gap-3">
          {saving ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Saving…
            </span>
          ) : savedAt ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-success">
              <Check className="size-3.5" /> Saved
            </span>
          ) : null}
          {!id && (
            <Button className="gap-2 rounded-xl" onClick={() => void handleCreate()} disabled={saving}>
              <PenLine className="size-4" /> Create document
            </Button>
          )}
        </div>
      </PageHeader>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {(docs ?? []).length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {(docs ?? []).slice(0, 8).map((d) => (
            <button
              key={d._id}
              onClick={() => navigate(`/writer/${d._id}`)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                d._id === id
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border/70 bg-card hover:border-primary/40"
              }`}
            >
              {d.title.length > 28 ? `${d.title.slice(0, 27)}…` : d.title}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-8">
            <div className="space-y-2">
              <Label htmlFor="writer-title" className="text-sm font-medium">Title</Label>
              <Input
                id="writer-title"
                value={title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setTitle(e.target.value);
                  dirtyRef.current = true;
                }}
                placeholder="Essay, lab report, literature review…"
                className="h-11 rounded-2xl"
                disabled={!!id && !doc}
              />
            </div>
            <div className="mt-5 space-y-2">
              <Label htmlFor="writer-body" className="text-sm font-medium">
                Body <span className="font-normal text-muted-foreground">(blank line = new paragraph)</span>
              </Label>
              <Textarea
                id="writer-body"
                value={content}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  setContent(e.target.value);
                  dirtyRef.current = true;
                }}
                placeholder="Write here. Select a paragraph to anchor citations against your Vault sources."
                className="min-h-[380px] rounded-2xl leading-relaxed"
                disabled={!!id && !doc}
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="font-data text-muted-foreground">
                {words.toLocaleString()} words
                {doc?.wordGoal ? ` / ${doc.wordGoal.toLocaleString()} goal` : ""}
              </span>
              {goalPct != null && (
                <span className="font-data font-semibold text-primary">{goalPct}%</span>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-border/80 bg-card/95 p-6">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              <Quote className="size-4" /> Evidence
            </p>

            {!id ? (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Create the document first — then select a paragraph and attach the
                exact passage that supports it.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {selectedParagraph != null
                    ? `Attaching to paragraph ${(selectedParagraph + 1).toLocaleString()}.`
                    : "Click a paragraph below to select it, then paste the supporting passage."}
                </p>
                <div className="mt-4 space-y-3">
                  <Textarea
                    value={citeSource}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCiteSource(e.target.value)}
                    placeholder="Paste the exact supporting passage from your material…"
                    className="min-h-[100px] rounded-2xl text-sm"
                  />
                  <Input
                    value={citeLocator}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCiteLocator(e.target.value)}
                    placeholder="Locator (optional) — e.g. ch. 3, p. 41"
                    className="h-10 rounded-2xl text-sm"
                  />
                  <Button
                    className="w-full gap-2 rounded-2xl"
                    onClick={() => void handleCite()}
                    disabled={selectedParagraph == null || citeSource.trim().length < 8 || saving}
                  >
                    <Quote className="size-4" /> Anchor citation
                  </Button>
                </div>
              </>
            )}

            {(citations ?? []).length > 0 && (
              <div className="mt-6 border-t border-border/70 pt-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Attached citations
                </p>
                <ol className="mt-3 space-y-3">
                  {(citations ?? []).map((c) => (
                    <motion.li
                      key={c._id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-border/70 bg-muted/30 p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-data text-[11px] font-bold text-primary">
                          [{c.ord}]
                        </span>
                        <button
                          aria-label="Remove citation"
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() => void removeCitation({ citationId: c._id as Id<"citations"> })}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-foreground/85">
                        “{c.sourceText}”
                      </p>
                      <p className="mt-1.5 font-data text-[10px] text-muted-foreground">
                        ¶{(c.paragraphIndex + 1).toLocaleString()}
                        {c.locator ? ` · ${c.locator}` : ""}
                      </p>
                    </motion.li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {id && paragraphs.length > 0 && (
            <div className="mt-5 rounded-3xl border border-border/80 bg-card/95 p-6">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <FileText className="size-4" /> Paragraphs
              </p>
              <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
                {paragraphs.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedParagraph(i)}
                    className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-xs leading-relaxed transition-colors ${
                      selectedParagraph === i
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-accent/60"
                    }`}
                  >
                    <span className="font-data font-bold text-primary">¶{i + 1}</span>
                    <span className="line-clamp-2">{p}</span>
                    {(citationsByParagraph.get(i) ?? 0) > 0 && (
                      <span className="ml-auto font-data text-[10px] font-bold text-success">
                        ×{citationsByParagraph.get(i)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {id && doc && (
        <div className="mt-8 flex items-center justify-between rounded-2xl border border-border/70 px-5 py-3.5">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="size-3.5 text-success" /> Grounded in your Vault · evidence stays traceable
          </span>
          <Button
            variant="ghost"
            className="h-auto gap-1.5 p-0 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => {
              void removeDoc({ id: id as Id<"writerDocs"> });
              navigate("/writer");
            }}
          >
            <Trash2 className="size-3.5" /> Delete document
          </Button>
        </div>
      )}
    </AppShell>
  );
}
