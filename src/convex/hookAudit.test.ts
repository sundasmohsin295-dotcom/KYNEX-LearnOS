import { describe, expect, test } from "vitest";
import { scanSource } from "../../scripts/hookAudit";

describe("hook audit scanner", () => {
  test("flags useState after an early return in the component body", () => {
    const src = [
      "export default function P() {",
      "  const x = useQuery(api.a.b);",
      "  if (!x) return <Loading />;",
      "  const [open, setOpen] = useState(false);",
      "  useEffect(() => {}, []);",
      "  return <div />;",
      "}",
    ].join("\n");
    const f = scanSource(src);
    const kinds = f.filter((x) => x.kind === "hook-after-return");
    expect(kinds.length).toBeGreaterThanOrEqual(2); // useState + useEffect flagged
    expect(kinds.some((x) => x.line === 4)).toBe(true);
    expect(kinds.some((x) => x.line === 5)).toBe(true);
  });

  test("flags hooks inside conditional branches and ternaries", () => {
    const src = [
      "function P() {",
      "  if (ready) return null;",
      "  const a = cond ? useState(0) : useState(1);",
      "  if (loading) useState(2);",
      "  return <div />;",
      "}",
    ].join("\n");
    const f = scanSource(src);
    expect(f.filter((x) => x.kind === "hook-in-branch").length).toBeGreaterThanOrEqual(2);
  });

  test("flags hooks invoked inside array callbacks", () => {
    const src = [
      "function P() {",
      "  items.map((x) => useState(x));",
      "  return <div />;",
      "}",
    ].join("\n");
    const f = scanSource(src);
    expect(f.some((x) => x.kind === "hook-in-callback")).toBe(true);
  });

  test("clean component produces no findings", () => {
    const src = [
      "export default function P() {",
      "  const x = useQuery(api.a.b);",
      "  const [open, setOpen] = useState(false);",
      "  useEffect(() => {}, []);",
      "  if (!x) return <Loading />;",
      "  if (open) { console.log('hi'); }",
      "  return <div>{x.map(() => <i key=\"k\" />)}</div>;",
      "}",
    ].join("\n");
    expect(scanSource(src)).toEqual([]);
  });

  test("render-time previous-value setState pattern is not flagged", () => {
    const src = [
      "export default function P() {",
      "  const [params, setParams] = useSearchParams2();",
      "  const modeParam = params.get('mode');",
      "  const prev = useRef<string | null>(null);",
      "  if (modeParam !== prev.current) {",
      "    prev.current = modeParam;",
      "    setMode(modeParam);",
      "  }",
      "  return <div />;",
      "}",
    ].join("\n");
    expect(scanSource(src)).toEqual([]);
  });
});
