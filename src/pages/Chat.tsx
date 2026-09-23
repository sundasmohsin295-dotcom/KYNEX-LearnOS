import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useNavigate, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  Bot, Check, ChevronDown, Download, MessageSquarePlus, Pencil, Search, Send, Star, Trash2, User,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { MODES, MODE_TO_AI, type ModeKey } from "@/lib/learning";

const QUICK_PROMPTS = [
  // KYNEX Professor quick intents
  "Explain this simply",
  "Explain this deeply",
  "Give me a real-world example",
  "Why does this work?",
  "Quiz me",
  "Teach me from zero",
  "Find the missing concept I need before learning this",
  "Ask me questions until you know I understand",
  "Still confused: diagnose what I'm missing and reteach it",
];

export default function Chat() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const conversations = useQuery(api.learning.listConversations);
  const materials = useQuery(api.materials.listReady);
  const sendUser = useMutation(api.learning.appendUserMessage);
  const runChat = useAction(api.aiEngine.chat);
  const createConv = useMutation(api.learning.createConversation);
  const starConv = useMutation(api.learning.starConversation);
  const renameConv = useMutation(api.learning.renameConversation);
  const deleteConv = useMutation(api.learning.deleteConversation);

  const [activeId, setActiveId] = useState<Id<"conversations"> | null>(null);
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<ModeKey>("summary");
  const [renaming, setRenaming] = useState<Id<"conversations"> | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [showSidebar, setShowSidebar] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = useQuery(
    api.learning.listMessages,
    activeId ? { conversationId: activeId } : "skip",
  );
  const activeConv = useMemo(
    () => conversations?.find((c) => c._id === activeId) ?? null,
    [conversations, activeId],
  );

  const materialId = (params.get("material") as Id<"materials"> | null) ?? activeConv?.materialId ?? null;
  const material = useQuery(
    api.materials.get,
    materialId ? { id: materialId } : "skip",
  );

  // URL-driven mode: apply once per distinct mode param via the
  // render-time previous-value pattern (no cascading state effect).
  const modeParam = params.get("mode");
  const prevModeParam = useRef<string | null>(null);
  if (modeParam !== prevModeParam.current) {
    prevModeParam.current = modeParam;
    if (modeParam && MODES.some((x) => x.key === modeParam)) {
      setMode(modeParam as ModeKey);
    }
  }

  // Command-bar handoff: /chat?q=… pre-fills the composer exactly once.
  const qParam = params.get("q");
  const appliedQ = useRef(false);
  if (qParam && !appliedQ.current) {
    appliedQ.current = true;
    setInput(qParam);
    setParams((p) => { p.delete("q"); return p; });
  }

  // Smart Search deep link: /chat?conv=<id> opens that conversation exactly
  // once, then the param is cleared so URL and local selection never fight.
  const convParam = params.get("conv");
  const appliedConv = useRef<string | null>(null);
  if (convParam && convParam !== appliedConv.current) {
    appliedConv.current = convParam;
    setActiveId(convParam as Id<"conversations">);
    setParams((p) => { p.delete("conv"); return p; }, { replace: true });
  }

  const concept = params.get("concept");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, waiting]);

  const filtered = (conversations ?? []).filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );

  const newChat = async () => {
    try {
      const id = await createConv({ materialId: materialId ?? undefined });
      setActiveId(id);
      setShowSidebar(false);
      setParams((p) => {
        p.delete("mode");
        return p;
      });
    } catch {
      toast.error("Couldn't create a new chat");
    }
  };

  const send = async (raw?: string) => {
    const content = (raw ?? input).trim();
    if (!content || waiting) return;
    let convId = activeId;
    let persisted = false;
    try {
      if (!convId) {
        convId = await createConv({ materialId: materialId ?? undefined });
        setActiveId(convId);
      }
      setInput("");
      setWaiting(true);
      await sendUser({ conversationId: convId, content });
      persisted = true;
      await runChat({ conversationId: convId, materialId: materialId ?? undefined, mode: MODE_TO_AI[mode] });
    } catch (e) {
      // If the message never reached the database, give the student their
      // text back — losing composed work to a network drop is a data-loss
      // bug, not just an error. If it WAS saved, it is in history; only the
      // reply failed.
      if (!persisted) setInput((cur) => (cur === "" ? content : cur));
      toast.error(e instanceof Error ? e.message : "The tutor couldn't reply");
    } finally {
      setWaiting(false);
    }
  };

  /** Export the active conversation as a readable Markdown file. */
  const exportConversation = () => {
    if (!activeConv || !messages || messages.length === 0) {
      toast.error("Nothing to export yet");
      return;
    }
    const lines = [
      `# ${activeConv.title}`,
      ``,
      `_Exported from KYNEX on ${new Date().toLocaleString()}_`,
      ``,
      ...messages.map(
        (m) => `## ${m.role === "user" ? "You" : "KYNEX Professor"}\n\n${m.content}\n`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeConv.title.replace(/[^\w\d -]/g, "").trim().slice(0, 60) || "conversation"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Conversation exported");
  };

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-3xl border border-border/70 bg-card lg:h-[calc(100vh-7rem)]">
        {/* ---------- Conversation sidebar ---------- */}
        <aside
          className={cn(
            "absolute inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-border/70 bg-sidebar transition-transform lg:static lg:translate-x-0",
            showSidebar ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="p-3">
            <Button className="w-full gap-2 rounded-xl" onClick={newChat}>
              <MessageSquarePlus className="size-4" /> New chat
            </Button>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations"
                className="h-9 rounded-lg pl-9 text-xs"
              />
            </div>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
            {filtered.map((c) => (
              <div
                key={c._id}
                className={cn(
                  "group relative rounded-xl px-3 py-2.5 transition-colors",
                  activeId === c._id ? "bg-primary/10" : "hover:bg-accent",
                )}
              >
                {renaming === c._id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && renameVal.trim()) {
                          try {
                            await renameConv({ id: c._id, title: renameVal.trim() });
                          } catch {
                            toast.error("Couldn't rename the conversation");
                          } finally {
                            setRenaming(null);
                          }
                        }
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="h-7 rounded-md text-xs"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      onClick={async () => {
                        if (!renameVal.trim()) return;
                        try {
                          await renameConv({ id: c._id, title: renameVal.trim() });
                        } catch {
                          toast.error("Couldn't rename the conversation");
                        } finally {
                          setRenaming(null);
                        }
                      }}
                    >
                      <Check className="size-3" />
                    </Button>
                  </div>
                ) : (
                  <button className="w-full text-left" onClick={() => { setActiveId(c._id); setShowSidebar(false); }}>
                    <p className="truncate pr-14 text-xs font-semibold">
                      {c.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(c.updatedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}
                    </p>
                  </button>
                )}
                <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 gap-0.5 group-hover:flex">
                  <button
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-xp-foreground"
                    title={c.starred ? "Unstar" : "Star"}
                    onClick={async () => {
                      try {
                        await starConv({ id: c._id });
                      } catch {
                        toast.error("Couldn't update the star");
                      }
                    }}
                  >
                    <Star className={cn("size-3", c.starred && "fill-xp text-xp")} />
                  </button>
                  <button
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                    title="Rename"
                    onClick={() => { setRenaming(c._id); setRenameVal(c.title); }}
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive"
                    title="Delete"
                    onClick={async () => {
                      try {
                        await deleteConv({ id: c._id });
                        if (activeId === c._id) setActiveId(null);
                      } catch {
                        toast.error("Couldn't delete the conversation");
                      }
                    }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No conversations yet.</p>
            )}
          </div>
        </aside>

        {/* ---------- Chat column ---------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* header */}
          <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
            <Button size="icon" variant="ghost" className="size-8 lg:hidden" onClick={() => setShowSidebar((s) => !s)}>
              <ChevronDown className="size-4 rotate-90" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                KYNEX Professor
                <span className="ml-2 hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary sm:inline">
                  {MODES.find((m) => m.key === mode)?.depth ?? "CORE"}
                </span>
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {material ? (
                  <>Context: <span className="font-semibold text-primary">{material.title}</span></>
                ) : (
                  "AI teaching system, not a human professor"
                )}
              </p>
            </div>
            <select
              value={materialId ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setParams((p) => {
                  if (v) p.set("material", v);
                  else p.delete("material");
                  return p;
                });
              }}
              className="h-8 max-w-44 rounded-lg border border-border bg-background px-2 text-xs font-medium"
            >
              <option value="">No material context</option>
              {(materials ?? []).map((m) => (
                <option key={m._id} value={m._id}>{m.title}</option>
              ))}
            </select>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              title="Export conversation as Markdown"
              onClick={exportConversation}
            >
              <Download className="size-4" />
            </Button>
          </div>

          {/* mode chips */}
          {/* HIG segmented control: the selection pill slides between chips
              with spring physics instead of remounting buttons. */}
          <div className="relative flex gap-1.5 overflow-x-auto border-b border-border/60 px-4 py-2 scrollbar-thin">
            {MODES.map((m) => (
              <motion.button
                key={m.key}
                onClick={() => setMode(m.key)}
                whileTap={{ scale: 0.97 }}
                transition={spring.snappy}
                className={cn(
                  "relative shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                  mode === m.key
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode === m.key && (
                  <motion.span
                    layoutId="chat-mode-pill"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-full bg-primary"
                  />
                )}
                <span className="relative z-10">{m.label}</span>
              </motion.button>
            ))}
          </div>

          {/* messages */}
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 scrollbar-thin">
            {(!messages || messages.length === 0) && (
              <div className="mx-auto mt-8 max-w-lg text-center">
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"
                >
                  <Bot className="size-7" />
                </motion.div>
                <p className="mt-4 font-display text-lg font-bold">
                  KYNEX Professor · {MODES.find((m) => m.key === mode)?.label ?? "ready"}
                </p>
                {concept && (
                  <p className="mt-2 text-sm font-semibold text-primary">
                    Focusing on: {concept}
                  </p>
                )}
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {MODES.find((m) => m.key === mode)?.desc}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-xs font-semibold transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages?.map((msg) => (
              <motion.div
                key={msg._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "assistant" && (
                  <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                    <Bot className="size-4" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%]",
                    msg.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md border border-border/70 bg-background",
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="space-y-2 [&_h3]:font-display [&_h3]:text-sm [&_h3]:font-bold [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_p+p]:mt-2 [&_strong]:text-foreground [&_table]:w-full [&_td]:border [&_td]:border-border/60 [&_td]:px-2 [&_th]:border [&_th]:border-border/60 [&_th]:px-2">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                      {msg.content.startsWith("Notice:") && (
                        <button
                          onClick={() => navigate("/security")}
                          className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          Run a live AI service status check →
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent">
                    <User className="size-4" />
                  </div>
                )}
              </motion.div>
            ))}
            {waiting && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Bot className="size-4" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border/70 bg-background px-4 py-3.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-1.5 rounded-full bg-primary"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                      transition={{ repeat: Infinity, duration: 1, delay: i * 0.18 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* composer */}
          <div className="border-t border-border/70 p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={concept ? `Learning ${concept}: tell your tutor what you already know…` : `Ask anything${material ? ` about ${material.title}` : ""}…`}
                rows={1}
                className="max-h-36 min-h-11 flex-1 resize-none rounded-xl"
              />
              <Button
                size="icon"
                className="size-11 shrink-0 rounded-xl shadow-md shadow-primary/25"
                disabled={waiting || !input.trim()}
                onClick={() => void send()}
              >
                <Send className="size-4.5" />
              </Button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              {MODES.find((m) => m.key === mode)?.depth} depth · {MODES.find((m) => m.key === mode)?.label}
              {" · "}Enter to send, Shift+Enter for a new line
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
