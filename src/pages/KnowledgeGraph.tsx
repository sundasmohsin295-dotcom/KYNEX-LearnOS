import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight, CircleDot, Network, Sparkles, Target, Wrench,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { DeferredMount, LockedSkeleton } from "@/components/LoadLock";
import { spring } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { conceptColor } from "@/lib/learning";

type Node = {
  key: string;
  label: string;
  state: "mastered" | "learning" | "weak" | "new";
  accuracy: number | null;
  materialId: string;
  materialTitle: string;
  difficulty: string;
};
type Edge = { from: string; to: string; kind: "prereq" };
type WeakRoot = { key: string; label: string; blockedBy: string[] };
type Graph = { nodes: Node[]; edges: Edge[]; weakRoots: WeakRoot[] };

const STATE_META = {
  mastered: { label: "MASTERED", cls: "bg-success/15 text-success", dot: "bg-success" },
  learning: { label: "LEARNING", cls: "bg-primary/10 text-primary", dot: "bg-primary" },
  weak: { label: "NEEDS PRACTICE", cls: "bg-chart-5/15 text-chart-5", dot: "bg-chart-5" },
  new: { label: "NOT TESTED", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
} as const;

/**
 * KYNEX Map — interactive knowledge graph over the caller's real concepts,
 * prerequisite edges and mastery states. Deterministic radial layout (no
 * WebGL dependency; fast, accessible, keyboard-friendly).
 */
export default function KnowledgeGraph() {
  const navigate = useNavigate();
  const graph = useQuery(api.learning.knowledgeGraph) as Graph | null | undefined;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Deterministic radial layout: concepts grouped by material, angle by index.
  const layout = useMemo(() => {
    if (!graph || graph.nodes.length === 0) return [];
    const R = 190;
    const cx = 260;
    const cy = 240;
    return graph.nodes.slice(0, 24).map((n, i) => {
      const angle = (i / graph.nodes.length) * Math.PI * 2 - Math.PI / 2;
      const rr = n.state === "mastered" ? R * 0.62 : R;
      return {
        ...n,
        x: cx + Math.cos(angle) * rr,
        y: cy + Math.sin(angle) * rr * 0.82,
      };
    });
  }, [graph]);

  const selected = layout.find((n) => n.key === selectedKey) ?? null;
  const selectedPrereqs = selected
    ? (graph?.edges ?? []).filter((e) => e.to === selected.key).map((e) => e.from)
    : [];

  if (graph === undefined) {
    return (
      <AppShell>
        {/* Layout-locked (§3): pins the radial panel's box — zero CLS when
            the graph hydrates. */}
        <LockedSkeleton className="rounded-3xl" height="384px" label="Loading knowledge graph" />
      </AppShell>
    );
  }
  if (graph === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl kynex-glass spectrum-border rounded-3xl p-10 text-center">
          <p className="font-display text-xl font-bold">Sign in to open the KYNEX Map</p>
          <Button className="mt-5" onClick={() => navigate("/auth")}>Sign in</Button>
        </div>
      </AppShell>
    );
  }

  const nodes = layout;
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  return (
    <AppShell>
      <PageHeader eyebrow="KYNEX Map · Knowledge Graph" title="Your Knowledge Universe">
        <p className="max-w-md text-sm text-muted-foreground">
          Every concept from your Vault, connected by prerequisite relationships from the
          analysis. Click a node to see its state and the fastest path to mastering it.
        </p>
      </PageHeader>

      {/* legend + weak-root banner */}
      {graph.nodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 kynex-glass spectrum-border rounded-2xl px-4 py-3">
          {Object.entries(STATE_META).map(([k, meta]) => (
            <span key={k} className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <span className={cn("size-2.5 rounded-full", meta.dot)} /> {meta.label}
            </span>
          ))}
        </div>
      )}

      {graph.weakRoots.length > 0 && (
        <div className="mt-4 rounded-3xl border border-chart-5/30 bg-chart-5/5 p-5">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-chart-5">
            <Wrench className="size-4" /> Root cause detected
          </p>
          <div className="mt-3 space-y-2.5">
            {graph.weakRoots.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  className="font-bold text-foreground underline decoration-chart-5/50 decoration-2 underline-offset-4 hover:text-chart-5"
                  onClick={() => setSelectedKey(r.key)}
                >
                  {r.label}
                </button>
                <span className="text-muted-foreground">is blocked by:</span>
                {r.blockedBy.map((b) => (
                  <button
                    key={b}
                    onClick={() => setSelectedKey(b)}
                    className="rounded-full bg-chart-5/10 px-2.5 py-1 text-xs font-semibold text-chart-5 transition-colors hover:bg-chart-5/20"
                  >
                    {byKey.get(b)?.label ?? b}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Fix the upstream concepts first: practicing the blocked topic alone won't stick until
            its prerequisites are solid.
          </p>
        </div>
      )}

      {/* graph — heavy radial render deferred to idle + near-viewport (§3):
          the diagnostics panel and sidebar mount immediately; the SVG only
          enters the tree when the main thread has slack. */}
      {nodes.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-border p-14 text-center">
          <Network className="mx-auto size-10 text-muted-foreground/50" />
          <p className="mt-4 font-display text-xl font-bold">Your graph is waiting</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Add a material to the Vault and analyze it: every concept becomes a node, and every
            answer you give colors the map.
          </p>
          <Button className="mt-5 gap-2" onClick={() => navigate("/add")}>Add a material</Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-5">
          <DeferredMount
            className="lg:col-span-3"
            fallback={<LockedSkeleton className="rounded-3xl" aspect="520 / 480" label="Rendering graph" />}
          >
          <div className="overflow-hidden kynex-glass spectrum-border rounded-3xl">
            <div className="grid-bg h-full w-full">
              <svg viewBox="0 0 520 480" className="h-auto w-full" role="img" aria-label="Knowledge graph of your concepts">
                {/* edges */}
                {nodes.flatMap((n) =>
                  (graph.edges ?? [])
                    .filter((e) => e.to === n.key && byKey.has(e.from))
                    .map((e, i) => {
                      const from = byKey.get(e.from)!;
                      return (
                        <line
                          key={`${e.from}-${e.to}-${i}`}
                          x1={from.x} y1={from.y} x2={n.x} y2={n.y}
                          stroke="currentColor"
                          className="text-border"
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                        />
                      );
                    }),
                )}
                {/* nodes */}
                {nodes.map((n, i) => {
                  const r = n.state === "mastered" ? 26 : n.state === "weak" ? 34 : 30;
                  // State-semantic fill: color IS the telemetry (per design
                  // system). No per-concept rainbow gradients.
                  const fill =
                    n.state === "mastered"
                      ? "var(--success)"
                      : n.state === "weak"
                        ? "var(--chart-5)"
                        : n.state === "learning"
                          ? "var(--primary)"
                          : "var(--muted-foreground)";
                  return (
                    <motion.g
                      key={n.key}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ ...spring.spatial, delay: i * 0.03 }}
                      onClick={() => setSelectedKey(n.key)}
                      className="cursor-pointer"
                      style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                    >
                      {n.state === "weak" && (
                        <circle cx={n.x} cy={n.y} r={r + 7} fill="none" stroke="var(--chart-5)" strokeOpacity={0.5} strokeWidth={2} strokeDasharray="3 3" />
                      )}
                      <circle
                        cx={n.x} cy={n.y} r={r}
                        fill={fill}
                        stroke={selectedKey === n.key ? "var(--foreground)" : "transparent"}
                        strokeWidth={3}
                      />
                      <text
                        x={n.x} y={n.y + 4}
                        textAnchor="middle"
                        className="fill-white text-[9px] font-bold"
                        style={{ pointerEvents: "none" }}
                      >
                        {n.label.length > 14 ? n.label.slice(0, 13) + "…" : n.label}
                      </text>
                      {n.accuracy != null && (
                        <text
                          x={n.x} y={n.y + r + 12}
                          textAnchor="middle"
                          className="fill-muted-foreground text-[9px] font-bold"
                          style={{ pointerEvents: "none" }}
                        >
                          {n.accuracy}%
                        </text>
                      )}
                    </motion.g>
                  );
                })}
                <defs>
                  {[0, 1, 2, 3, 4, 5].map((k) => {
                    const palettes = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#14b8a6"];
                    return (
                      <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={palettes[k % palettes.length]} />
                        <stop offset="100%" stopColor={palettes[(k + 1) % palettes.length]} />
                      </linearGradient>
                    );
                  })}
                </defs>
              </svg>
            </div>
          </div>
          </DeferredMount>

          {/* inspector */}
          <div className="kynex-glass spectrum-border rounded-3xl p-5 lg:col-span-2">
            {selected ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Concept</p>
                    <h3 className="mt-1 font-display text-xl font-extrabold">{selected.label}</h3>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", STATE_META[selected.state].cls)}>
                    {STATE_META[selected.state].label}
                  </span>
                </div>

                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Accuracy</dt>
                    <dd className="font-bold">{selected.accuracy != null ? `${selected.accuracy}%` : "not tested"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Difficulty</dt>
                    <dd className="font-bold capitalize">{selected.difficulty}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="max-w-40 truncate text-right font-semibold" title={selected.materialTitle}>
                      {selected.materialTitle}
                    </dd>
                  </div>
                </dl>

                {selectedPrereqs.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Prerequisites in your graph</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedPrereqs.map((p) => (
                        <button
                          key={p}
                          onClick={() => setSelectedKey(p)}
                          className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {byKey.get(p)?.label ?? p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5 space-y-2">
                  {selected.state === "weak" && (
                    <Button className="w-full gap-2 rounded-xl" onClick={() => navigate(`/practice/${selected.materialId}?concept=${encodeURIComponent(selected.key)}`)}>
                      <Wrench className="size-4" /> Fix this concept
                    </Button>
                  )}
                  {selected.state === "new" && (
                    <Button className="w-full gap-2 rounded-xl" onClick={() => navigate(`/practice/${selected.materialId}?concept=${encodeURIComponent(selected.key)}`)}>
                      <Target className="size-4" /> Test yourself on it
                    </Button>
                  )}
                  {selected.state === "learning" && (
                    <Button className="w-full gap-2 rounded-xl" onClick={() => navigate(`/practice/${selected.materialId}?concept=${encodeURIComponent(selected.key)}`)}>
                      <CircleDot className="size-4" /> Keep practicing
                    </Button>
                  )}
                  {selected.state === "mastered" && (
                    <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={() => navigate(`/chat?material=${selected.materialId}&mode=deep&concept=${encodeURIComponent(selected.key)}`)}>
                      <Sparkles className="size-4" /> Go deeper with the Professor
                    </Button>
                  )}
                  <Button variant="ghost" className="w-full gap-2 rounded-xl" onClick={() => navigate(`/material/${selected.materialId}`)}>
                    Open material <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <Network className="size-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-semibold">Select a node</p>
                <p className="mt-1 max-w-48 text-xs text-muted-foreground">
                  Click any concept in the graph to inspect its mastery, prerequisites and next action.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
