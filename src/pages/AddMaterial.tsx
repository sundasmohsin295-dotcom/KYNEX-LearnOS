import { useCallback, useRef, useState } from "react";import { useMutation, useAction } from "convex/react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, FileUp, Link2, Sparkles, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ProcessingPipeline } from "@/components/VisualBits";
import { cn } from "@/lib/utils";
import { extractTextFromFile } from "@/lib/learning";

type Tab = "url" | "text" | "file";

const URL_PLACEHOLDER = "https://youtube.com/watch?v=… or any article / lecture page";

export default function AddMaterial() {
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<"idle" | "working" | "error">("idle");
  const [stage, setStage] = useState("receiving");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  // Kept in state (not a ref) so the button's disabled state re-renders when
  // a file is chosen — refs don't trigger renders.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const createText = useMutation(api.materials.createText);
  const markFailed = useMutation(api.materials.markFailed);
  const analyze = useAction(api.aiEngine.analyze);
  const ingestUrl = useAction(api.aiEngine.ingestUrl);
  const navigate = useNavigate();

  const runPipeline = useCallback(
    async (job: () => Promise<void>) => {
      setPhase("working");
      setErrorMsg("");
      try {
        await job();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(msg);
        setPhase("error");
      }
    },
    [],
  );

  const handleUrl = () =>
    runPipeline(async () => {
      setStage("receiving");
      const id = await ingestUrl({ url: url.trim() });
      setStage("generating");
      navigate(`/material/${id}`);
    });

  const handleText = () =>
    runPipeline(async () => {
      setStage("receiving");
      const id = await createText({
        title: title.trim() || "Pasted notes",
        text,
        kind: "text",
      });
      setStage("reading");
      await analyze({ materialId: id });
      navigate(`/material/${id}`);
    });

  const handleFile = () =>
    runPipeline(async () => {
      const file = pendingFile;
      if (!file) throw new Error("No file selected.");
      setStage("reading");
      let extracted = "";
      try {
        extracted = await extractTextFromFile(file);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Couldn't read that file: ${msg}`);
      }
      if (extracted.trim().length < 40) {
        throw new Error(
          "We couldn't extract readable text from that file (it may be a scan or image-only PDF).",
        );
      }
      setStage("understanding");
      const id = await createText({
        title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
        text: extracted,
        kind: file.name.toLowerCase().endsWith(".pdf")
          ? "pdf"
          : file.name.toLowerCase().match(/\.(docx?|pptx?)$/)
            ? "docx"
            : file.name.toLowerCase().endsWith(".csv")
              ? "csv"
              : file.name.toLowerCase().match(/\.(ts|tsx|js|py|java|c|cpp|go|rs)$/)
                ? "code"
                : "txt",
      });
      try {
        setStage("generating");
        await analyze({ materialId: id });
      } catch (err) {
        // The material row exists but analysis failed — persist the failure so
        // the Vault never shows a stuck "processing" row. Best effort: the
        // thrown error below still surfaces in the UI.
        await markFailed({
          id,
          error: err instanceof Error ? err.message : "Analysis failed",
        }).catch(() => {});
        throw err;
      }
      navigate(`/material/${id}`);
    });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  };

  const acceptFile = (f: File) => {
    if (f.size > 25 * 1024 * 1024) {
      setErrorMsg("File is larger than 25 MB. Try a smaller file.");
      setPhase("error");
      return;
    }
    setPendingFile(f);
    setFileName(f.name);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    setTab("file");
    setPhase("idle");
    setErrorMsg("");
  };

  const busy = phase === "working";

  return (
    <AppShell>
      <PageHeader eyebrow="KYNEX Vault · Knowledge ingestion" title="Add to your Vault">
        <p className="max-w-md text-sm text-muted-foreground">
          Any source becomes structured knowledge: concepts, questions, Recall cards and mastery tracking.
        </p>
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-1.5 kynex-glass spectrum-border rounded-2xl p-1.5">
        {(
          [
            { key: "url", label: "Link / YouTube", icon: Link2 },
            { key: "text", label: "Paste text", icon: Sparkles },
            { key: "file", label: "Upload file", icon: FileUp },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            disabled={busy}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <t.icon className="size-4" /> <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="mt-5 kynex-glass spectrum-border rounded-3xl p-6 sm:p-8">
        <AnimatePresence mode="wait">
          {tab === "url" && (
            <motion.div
              key="url"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={URL_PLACEHOLDER}
                disabled={busy}
                className="h-12 rounded-xl text-base"
                onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && handleUrl()}
              />
              <p className="text-xs text-muted-foreground">
                We fetch the page server-side, extract the readable content and analyze it. Works
                best with articles, documentation and lecture notes.
              </p>
              <Button size="lg" className="w-full gap-2 rounded-xl" disabled={busy || !url.trim()} onClick={handleUrl}>
                <Link2 className="size-4.5" /> {busy ? "Fetching & analyzing…" : "Analyze this link"}
              </Button>
            </motion.div>
          )}

          {tab === "text" && (
            <motion.div
              key="text"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give it a title (e.g. Chapter 4: Subnetting)"
                disabled={busy}
                className="h-11 rounded-xl"
              />
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste your notes, a chapter, a transcript: anything you need to master…"
                disabled={busy}
                className="min-h-56 rounded-xl text-sm leading-relaxed"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {text.trim().length < 40
                    ? "At least a paragraph is needed."
                    : `${text.trim().split(/\s+/).length} words ready.`}
                </p>
                <Button
                  size="lg"
                  className="gap-2 rounded-xl"
                  disabled={busy || text.trim().length < 40}
                  onClick={handleText}
                >
                  <Sparkles className="size-4.5" /> {busy ? "Analyzing…" : "Analyze this text"}
                </Button>
              </div>
            </motion.div>
          )}

          {tab === "file" && (
            <motion.div
              key="file"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => !busy && fileRef.current?.click()}
                className={cn(
                  "grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                )}
              >
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*,audio/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) acceptFile(f);
                  }}
                />
                <motion.div animate={dragOver ? { scale: 1.06 } : { scale: 1 }}>
                  <Upload className="mx-auto size-10 text-primary" />
                  <p className="mt-3 font-semibold">
                    {fileName ? fileName : "Drop a file here, or click to browse"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF, DOCX, TXT, CSV, images, audio · up to 25 MB
                  </p>
                </motion.div>
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional, we'll use the file name)"
                disabled={busy}
                className="h-11 rounded-xl"
              />
              <Button
                size="lg"
                className="w-full gap-2 rounded-xl"
                disabled={busy || pendingFile === null}
                onClick={handleFile}
              >
                <FileUp className="size-4.5" /> {busy ? "Extracting & analyzing…" : "Analyze this file"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pipeline / error */}
        {phase !== "idle" && (
          <div className="mt-6">
            {phase === "working" && (
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
                <ProcessingPipeline stage={stage} />
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Deep analysis usually takes 20 to 60 seconds. Keep this tab open.
                </p>
              </div>
            )}
            {phase === "error" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5"
              >
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="flex-1">
                  <p className="font-semibold text-destructive">Processing failed</p>
                  <p className="mt-1 text-sm text-muted-foreground">{errorMsg}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Nothing was faked: the material wasn't analyzed. Adjust and try again.
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setPhase("idle")}>
                  <X className="size-4" />
                </Button>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* kind chips */}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {["URL", "YouTube", "PDF", "DOCX", "PPTX", "TXT", "Images", "Audio", "CSV", "Code", "Pasted text"].map((k) => (
          <span key={k} className="rounded-full border border-border/70 bg-card px-3 py-1 text-[11px] font-semibold text-muted-foreground">
            {k}
          </span>
        ))}
      </div>
    </AppShell>
  );
}
