import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  GitCompare, GitBranch, Clock, ListTree, Loader2, Shapes, Sparkles, Trash2, Waypoints,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, PageHeader } from "@/components/AppShell";
import { LockedSkeleton, DeferredMount } from "@/components/LoadLock";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";

type DiagramSpec = {
  root: string;
  nodes: { id: string; label: string; parent?: string; detail?: string; when?: string }[];
  edges?: { from: string; to: string; label?: string }[];
  sides?: { leftTitle: string; rightTitle: string; left: string[]; right: string[] };
};

type Diagram = {
  _id: string;
  materialId?: string;
  title: string;
  kind: string;
  spec: DiagramSpec;
  createdAt: number;
};

type Material = {
  _id: string;
  title: string;
  status: string;
};

const KINDS = [
  { key: "mindmap", label: "Mind map", icon: Waypoints, hint: "Radiating branches from the core topic" },
  { key: "flow", label: "Flowchart", icon: GitBranch, hint: "Directed steps of a process" },
  { key: "hierarchy", label: "Hierarchy", icon: ListTree, hint: "General → specific tree" },
  { key: "timeline", label: "Timeline", icon: Clock, hint: "Ordered developments" },
  { key: "compare", label: "Comparison", icon: GitCompare, hint: "Two ideas, side by side" },
] as const;

type KindKey = (typeof KINDS)[number]["key"];

/** Simple deterministic layered layout: root centered top, children below by
 *  depth. No WebGL — pure SVG, fast, keyboard-accessible, zero CLS. */
function layout(spec: DiagramSpec) {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];
  for (const n of spec.nodes) {
    if (n.parent && byId.has(n.parent) && n.parent !== n.id) {
      const arr = childrenOf.get(n.parent) ?? [];
      arr.push(n.id);
      childrenOf.set(n.parent, arr);
    } else {
      roots.push(n.id);
    }
  }
  // depth via BFS from declared roots
  const depth = new Map<string, number>();
  const queue = [...roots];
  for (const r of roots) depth.set(r, 0);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const child of childrenOf.get(cur) ?? []) {
      if (!depth.has(child)) {
        depth.set(child, (depth.get(cur) ?? 0) + 1);
        queue.push(child);
      }
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  const W = 720;
  const rowH = 108;
  const H = (maxDepth + 1) * rowH + 40;
  const positions = new Map<string, { x: number; y: number; depth: number }>();
  const levels = new Map<number, string[]>();
  for (const n of spec.nodes) {
    const d = depth.get(n.id) ?? maxDepth;
    const arr = levels.get(d) ?? [];
    arr.push(n.id);
    levels.set(d, arr);
  }
  for (const [d, ids] of levels) {
    ids.forEach((nodeId, i) => {
      const slot = (i + 1) / (ids.length + 1);
      positions.set(nodeId, { x: W * slot, y: 40 + d * rowH, depth: d });
    });
  }
  return { positions, childrenOf, W, H, byId };
}

function DiagramCanvas({ spec, title }: { spec: DiagramSpec; title: string }) {
  const { positions, childrenOf, W, H, byId } = useMemo(() => layout(spec), [spec]);
  const compare = spec.sides;

  if (compare) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" role="img" aria-label={`Comparison diagram: ${title}`}>
        {[compare.left, compare.right].map((items, side) => (
          <div
            key={side}
            className={cn(
              "rounded-2xl border p-5",
              side === 0 ? "border-primary/30 bg-primary/5" : "border-chart-3/30 bg-chart-3/5",
            )}
          >
            <p className={cn("text-xs font-bold uppercase tracking-[0.18em]", side === 0 ? "text-primary" : "text-chart-3")}>
              {side === 0 ? compare.leftTitle : compare.rightTitle}
            </p>
            <ul className="mt-3 space-y-2.5">
              {items.map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", side === 0 ? "bg-primary" : "bg-chart-3")} />
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid-bg overflow-x-auto rounded-2xl">
      <svg
        viewBox={`0 0 ${W} ${Math.max(H, 240)}`}
        className="h-auto w-full min-w-[560px]"
        role="img"
        aria-label={`${title} diagram`}
      >
        {/* edges */}
        {spec.nodes.flatMap((n) => {
          if (!n.parent || !positions.has(n.parent) || !positions.has(n.id)) return [];
          const a = positions.get(n.parent)!;
          const b = positions.get(n.id)!;
          return [
            <line
              key={`e-${n.id}`}
              x1={a.x} y1={a.y + 18} x2={b.x} y2={b.y - 18}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1.6}
            />,
          ];
        })}
        {spec.edges?.flatMap((e) => {
          const a = positions.get(e.from);
          const b = positions.get(e.to);
          if (!a || !b) return [];
          return [
            <g key={`ge-${e.from}-${e.to}`}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="currentColor"
                className="text-primary/40"
                strokeWidth={1.4}
                strokeDasharray="5 3"
              />
              {e.label && (
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 5}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-semibold"
                >
                  {e.label}
                </text>
              )}
            </g>,
          ];
        })}
        {/* nodes */}
        {spec.nodes.map((n, i) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const isRoot = n.id === spec.root || !(n.parent && byId.has(n.parent));
          const r = isRoot ? 26 : 22;
          const fill = isRoot ? "var(--primary)" : "var(--card)";
          const stroke = "var(--border)";
          const textFill = isRoot ? "var(--primary-foreground)" : "var(--foreground)";
          const label = n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label;
          return (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.spatial, delay: i * 0.03 }}
            >
              {n.detail && <title>{n.detail}</title>}
              <rect
                x={p.x - 84} y={p.y - r} width={168} height={r * 2} rx={16}
                fill={fill}
                stroke={stroke}
                strokeWidth={1.4}
              />
              <text
                x={p.x} y={p.y + 4}
                textAnchor="middle"
                fill={textFill}
                className="text-[11px] font-bold"
                style={{ pointerEvents: "none" }}
              >
                {label}
              </text>
              {n.when && (
                <text
                  x={p.x} y={p.y + r + 14}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px] font-bold"
                  style={{ pointerEvents: "none" }}
                >
                  {n.when}
                </text>
              )}
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Visualize() {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useAuth();
  const materials = useQuery(api.materials.listReady) as Material[] | undefined;
  const diagrams = useQuery(api.visuals.list, {}) as Diagram[] | undefined;
  const generate = useAction(
    (api.aiEngine as unknown as { generateVisual: typeof api.materials.list }).generateVisual as never,
  ) as unknown as (args: { materialId: string; kind: string }) => Promise<string>;
  const removeDiagram = useMutation(api.visuals.remove);

  const [materialId, setMaterialId] = useState<string | null>(null);
  const [kind, setKind] = useState<KindKey>("mindmap");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = (diagrams ?? []).find((d) => d._id === activeId) ?? null;

  const handleGenerate = async () => {
    if (!materialId) return;
    setBusy(true);
    setError(null);
    try {
      const newId = await generate({ materialId, kind });
      setActiveId(newId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the diagram.");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <LockedSkeleton height="420px" label="Loading visual explanations" />
      </AppShell>
    );
  }
  if (!isAuthenticated) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md kynex-glass spectrum-border rounded-3xl p-10 text-center">
          <p className="font-display text-xl font-bold">Sign in to visualize your subjects</p>
          <Button className="mt-5" onClick={() => navigate("/auth?returnTo=/visualize")}>
            Sign in
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader eyebrow="Visual Explanations · See the structure" title="Visualize">
        <p className="max-w-md text-sm text-muted-foreground">
          Turn any analyzed material into a mind map, flowchart, hierarchy, timeline
          or side-by-side comparison — grounded in your own content.
        </p>
      </PageHeader>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* generator */}
      <div className="rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-7">
        {materials === undefined ? (
          <LockedSkeleton height="120px" label="Loading your materials" />
        ) : materials.length === 0 ? (
          <div className="text-center">
            <Shapes className="mx-auto size-9 text-muted-foreground/50" />
            <p className="mt-3 font-display text-lg font-bold">Nothing to visualize yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              Add a material to the Vault and let the analysis finish — then any topic
              becomes a diagram.
            </p>
            <Button className="mt-4 gap-2 rounded-xl" onClick={() => navigate("/add")}>
              <Sparkles className="size-4" /> Add a material
            </Button>
          </div>
        ) : (
          <>
            <label htmlFor="viz-material" className="text-sm font-medium">
              1 · Choose a material
            </label>
            <select
              id="viz-material"
              value={materialId ?? ""}
              onChange={(e) => setMaterialId(e.target.value || null)}
              className="mt-2 h-11 w-full rounded-2xl border border-input bg-card px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select from your Vault…</option>
              {materials.map((m) => (
                <option key={m._id} value={m._id}>{m.title}</option>
              ))}
            </select>

            <p className="mt-5 text-sm font-medium">2 · Choose a diagram type</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  onClick={() => setKind(k.key)}
                  title={k.hint}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3.5 text-xs font-semibold transition-colors",
                    kind === k.key
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/70 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  <k.icon className="size-4" />
                  {k.label}
                </button>
              ))}
            </div>

            <Button
              className="mt-5 gap-2 rounded-2xl"
              onClick={() => void handleGenerate()}
              disabled={!materialId || busy}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Structuring your diagram…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Generate diagram
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {/* saved diagrams */}
      {diagrams && diagrams.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {diagrams.slice(0, 10).map((d) => (
            <span
              key={d._id}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                d._id === activeId
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border/70 bg-card hover:border-primary/40",
              )}
            >
              <button onClick={() => setActiveId(d._id)}>
                {d.title.length > 30 ? `${d.title.slice(0, 29)}…` : d.title}
              </button>
              <button
                aria-label="Delete diagram"
                onClick={() => {
                  void removeDiagram({ id: d._id as Id<"visualDiagrams"> });
                  if (activeId === d._id) setActiveId(null);
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* active diagram — deferred + layout-locked so hydration never shifts */}
      {active && (
        <DeferredMount
          className="mt-6"
          fallback={<LockedSkeleton className="rounded-3xl" aspect="720 / 420" label="Rendering diagram" />}
        >
          <div className="rounded-3xl border border-border/80 bg-card/95 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{active.title}</h2>
              <span className="rounded-full bg-muted px-2.5 py-1 font-data text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {KINDS.find((k) => k.key === active.kind)?.label ?? active.kind}
              </span>
            </div>
            <div className="mt-4">
              <DiagramCanvas spec={active.spec} title={active.title} />
            </div>
            {/* node details */}
            {active.spec.nodes.some((n) => n.detail) && (
              <dl className="mt-5 grid gap-2 border-t border-border/70 pt-4 sm:grid-cols-2">
                {active.spec.nodes
                  .filter((n) => n.detail)
                  .slice(0, 12)
                  .map((n) => (
                    <div key={n.id} className="text-xs leading-relaxed">
                      <dt className="font-bold">{n.label}</dt>
                      <dd className="text-muted-foreground">{n.detail}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </div>
        </DeferredMount>
      )}
    </AppShell>
  );
}
