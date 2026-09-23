import {
  MotionConfig,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type HTMLMotionProps,
  type Transition,
} from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * KYNEX spring-physics motion language.
 *
 * Every transition in the product resolves through one of these tokens, so the
 * whole OS shares one physical "feel": no one-off durations, no arbitrary
 * easings. Framer springs map directly to mass/tension/friction via
 * stiffness/damping/mass, so tuning is physical, not time-based.
 *
 * `spring.smooth` is also registered as the MotionConfig default, so any
 * `transition` prop that omits its own spring inherits it.
 */
export const spring = {
  /** UI feedback: chips, hover states, small controls. Snappy, minimal drift. */
  snappy: { type: "spring", stiffness: 520, damping: 32, mass: 0.9 },
  /** Standard: panels, cards, list reorders, tab content. */
  smooth: { type: "spring", stiffness: 300, damping: 30, mass: 1 },
  /** Expressive: hero reveals, mission complete, modals. Noticeable travel. */
  expressive: { type: "spring", stiffness: 220, damping: 26, mass: 1.1 },
  /** Spatial: Radix poppers, command bar. Slight overshoot, settles fast. */
  spatial: { type: "spring", stiffness: 420, damping: 28, mass: 0.8 },
} satisfies Record<string, Transition>;

/** Standard enter-from-below offsets used with the tokens above. */
export const rise = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
} as const;

/** Reduced-motion substitute: opacity only, no spatial travel. */
export const riseStill = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

/**
 * Global motion defaults. `reducedMotion="user"` is the critical piece:
 * framer-motion rewrites every spring and tween to a simple opacity fade when
 * the OS reports prefers-reduced-motion, app-wide, including all
 * AnimatePresence transitions. No per-component plumbing needed.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={spring.smooth}>
      {children}
    </MotionConfig>
  );
}

/**
 * TiltCard: layered containment panel with pointer-tracking 3D perspective
 * tilt. Subtle by design (±2.5deg) and physically inert for users with
 * reduced-motion enabled: it renders as a plain div there.
 */
export function TiltCard({
  className,
  maxTilt = 2.5,
  children,
  ...rest
}: {
  className?: string;
  maxTilt?: number;
  children: React.ReactNode;
} & Omit<HTMLMotionProps<"div">, "children">) {
  const reduce = useReducedMotion();
  const rx = useSpring(0, spring.snappy);
  const ry = useSpring(0, spring.snappy);

  // No hooks past this point: the reduced-motion path is a static div.
  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn("relative [perspective:900px]", className)}
      style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
      onPointerMove={(e) => {
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        ry.set(px * maxTilt * 2);
        rx.set(-py * maxTilt * 2);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
