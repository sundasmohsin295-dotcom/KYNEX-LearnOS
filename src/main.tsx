import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ThemeProvider } from "next-themes";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import {
  installGlobalErrorHandlers,
  reportCrash,
  safeCrashMessage,
} from "@/lib/globalErrorHandler";
import { installCrashTelemetry } from "@/lib/crashTelemetry";
import { routeBreakers, routeKeyFromPathname } from "@/lib/routeCircuitBreaker";
import { DegradedRoute } from "@/components/DegradedRoute";
import { SystemRecoveryScreen } from "@/components/SystemRecoveryScreen";
import { MotionProvider } from "@/lib/motion";
import { api } from "@/convex/_generated/api";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Library = lazy(() => import("./pages/Library.tsx"));
const AddMaterial = lazy(() => import("./pages/AddMaterial.tsx"));
const MaterialDetail = lazy(() => import("./pages/MaterialDetail.tsx"));
const Chat = lazy(() => import("./pages/Chat.tsx"));
const Practice = lazy(() => import("./pages/Practice.tsx"));
const QuizPage = lazy(() => import("./pages/QuizPage.tsx"));
const Flashcards = lazy(() => import("./pages/Flashcards.tsx"));
const Achievements = lazy(() => import("./pages/Achievements.tsx"));
const Twin = lazy(() => import("./pages/Twin.tsx"));
const Insights = lazy(() => import("./pages/Insights.tsx"));
const GpaLab = lazy(() => import("./pages/GpaLab.tsx"));
const MistakeBank = lazy(() => import("./pages/MistakeBank.tsx"));
const KnowledgeGraph = lazy(() => import("./pages/KnowledgeGraph.tsx"));
const MissionScreen = lazy(() => import("./pages/MissionScreen.tsx"));
const Planner = lazy(() => import("./pages/Planner.tsx"));
const ExaminerPage = lazy(() => import("./pages/ExaminerPage.tsx"));
const Writer = lazy(() => import("./pages/Writer.tsx"));
const Visualize = lazy(() => import("./pages/Visualize.tsx"));
const Security = lazy(() => import("./pages/Security.tsx"));
const PlanPage = lazy(() => import("./pages/PlanPage.tsx"));
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const Terms = lazy(() => import("./pages/Terms.tsx"));
const Faq = lazy(() => import("./pages/Faq.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/**
 * Root crash guard (§2 Zero-Crash Architecture). A fatal render error swaps
 * the whole app for the dark SystemRecoveryScreen — correlation ID + safe
 * message only; raw stacks never render to the user (console only).
 */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; correlationId: string }
> {
  state = { hasError: false, message: "", correlationId: "" };
  static getDerivedStateFromError(error: Error) {
    const entry = reportCrash(error, "error");
    return {
      hasError: true,
      message: safeCrashMessage(error),
      correlationId: entry.id,
    };
  }
  componentDidCatch(err: Error) {
    console.error("[KYNEX] Root crash captured:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <SystemRecoveryScreen
          message={this.state.message}
          correlationId={this.state.correlationId}
          onReboot={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * Route-level guard (§2 + §1): a crash inside one lazy route no longer takes
 * down the shell. First crash → recovery screen; "Reboot" re-mounts the
 * route's subtree via a key bump. If the SAME route crashes again within the
 * 60s window the route-level circuit breaker trips (§1): the boundary
 * bypasses the broken module and renders the isolated DegradedRoute
 * container — no crash loop, shell intact — until "Reload Module" re-arms it.
 */
class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  {
    hasError: boolean;
    message: string;
    correlationId: string;
    reloadKey: number;
    tripped: boolean;
    routeKey: string;
  }
> {
  state = {
    hasError: false,
    message: "",
    correlationId: "",
    reloadKey: 0,
    tripped: false,
    routeKey: "",
  };
  static getDerivedStateFromError(error: Error) {
    const entry = reportCrash(error, "error");
    return {
      hasError: true,
      message: safeCrashMessage(error),
      correlationId: entry.id,
    };
  }
  componentDidCatch() {
    // §1: record with the route circuit breaker. Parameterized paths collapse
    // to their route key so /material/:id aggregates as one module.
    const routeKey = routeKeyFromPathname(
      typeof window !== "undefined" ? window.location.pathname : "/",
    );
    if (routeBreakers.recordCrash(routeKey)) {
      this.setState({ tripped: true, routeKey });
    }
  }
  render() {
    if (this.state.tripped) {
      return (
        <DegradedRoute
          routeKey={this.state.routeKey}
          onReload={() => {
            routeBreakers.reset(this.state.routeKey);
            this.setState((s) => ({
              hasError: false,
              tripped: false,
              reloadKey: s.reloadKey + 1,
            }));
          }}
        />
      );
    }
    if (this.state.hasError) {
      return (
        <SystemRecoveryScreen
          message={this.state.message}
          correlationId={this.state.correlationId}
          onReboot={() =>
            this.setState((s) => ({ hasError: false, reloadKey: s.reloadKey + 1 }))
          }
        />
      );
    }
    return <React.Fragment key={this.state.reloadKey}>{this.props.children}</React.Fragment>;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// §2: capture fatal errors + async rejections before anything renders.
installGlobalErrorHandlers();

// §1 Proactive telemetry: every captured crash (window errors, rejections,
// boundary catches via reportCrash) is fingerprinted and merged into count-
// batched samples, flushed to the server in bounded batches. Fire-and-forget
// by contract — a telemetry failure can never surface or break the app.
installCrashTelemetry((samples) => {
  void convex.mutation(api.telemetry.recordClientErrorBatch, {
    samples: samples.map((s) => ({
      fingerprint: s.fingerprint,
      kind: s.kind,
      message: s.message,
      count: s.count,
      route: s.route,
      scope: s.scope,
    })),
  });
});



function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


// §1 zero-crash boot: #root must exist before React mounts. A missing mount
// node (bad HTML, an over-eager extension wiping <body>) is a fatal boot
// failure — render a visible diagnostic instead of a blank page/undefined deref.
const rootElement = document.getElementById("root");
if (!rootElement) {
  document.body.innerHTML =
    '<div style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;color:#111;background:#fff;text-align:center;padding:24px"><div><h1 style=\"font-size:20px;font-weight:700\">KYNEX failed to mount</h1><p style=\"margin-top:8px;font-size:14px;color:#555\">The app root element is missing. Reload the page; if it repeats, contact support.</p></div></div>';
  throw new Error("KYNEX boot failure: #root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        {/* Dual-mode theme: class-based tokens, no FOUC (index.html pre-sets
            the class before paint using the same "theme" storage key). */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <MotionProvider>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <RouteErrorBoundary>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/faq" element={<Faq />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/twin"
                element={
                  <RequireAuth>
                    <Twin />
                  </RequireAuth>
                }
              />
              <Route
                path="/insights"
                element={
                  <RequireAuth>
                    <Insights />
                  </RequireAuth>
                }
              />
              <Route
                path="/gpa"
                element={
                  <RequireAuth>
                    <GpaLab />
                  </RequireAuth>
                }
              />
              <Route
                path="/mistakes"
                element={
                  <RequireAuth>
                    <MistakeBank />
                  </RequireAuth>
                }
              />
              <Route
                path="/graph"
                element={
                  <RequireAuth>
                    <KnowledgeGraph />
                  </RequireAuth>
                }
              />
              <Route
                path="/library"
                element={
                  <RequireAuth>
                    <Library />
                  </RequireAuth>
                }
              />
              <Route
                path="/add"
                element={
                  <RequireAuth>
                    <AddMaterial />
                  </RequireAuth>
                }
              />
              <Route
                path="/material/:id"
                element={
                  <RequireAuth>
                    <MaterialDetail />
                  </RequireAuth>
                }
              />
              <Route
                path="/chat"
                element={
                  <RequireAuth>
                    <Chat />
                  </RequireAuth>
                }
              />
              <Route
                path="/practice"
                element={
                  <RequireAuth>
                    <Practice />
                  </RequireAuth>
                }
              />
              <Route
                path="/practice/:materialId"
                element={
                  <RequireAuth>
                    <Practice />
                  </RequireAuth>
                }
              />
              <Route
                path="/quiz/:attemptId"
                element={
                  <RequireAuth>
                    <QuizPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/flashcards"
                element={
                  <RequireAuth>
                    <Flashcards />
                  </RequireAuth>
                }
              />
              <Route
                path="/mission"
                element={
                  <RequireAuth>
                    <MissionScreen />
                  </RequireAuth>
                }
              />
              <Route
                path="/mission/:missionId"
                element={
                  <RequireAuth>
                    <MissionScreen />
                  </RequireAuth>
                }
              />
              <Route
                path="/planner"
                element={
                  <RequireAuth>
                    <Planner />
                  </RequireAuth>
                }
              />
              <Route
                path="/security"
                element={
                  <RequireAuth>
                    <Security />
                  </RequireAuth>
                }
              />
              <Route
                path="/examiner"
                element={
                  <RequireAuth>
                    <ExaminerPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/writer"
                element={
                  <RequireAuth>
                    <Writer />
                  </RequireAuth>
                }
              />
              <Route
                path="/writer/:id"
                element={
                  <RequireAuth>
                    <Writer />
                  </RequireAuth>
                }
              />
              <Route
                path="/visualize"
                element={
                  <RequireAuth>
                    <Visualize />
                  </RequireAuth>
                }
              />
              {/* Personal Memory Vault alias: /vault is the same surface as
                  the Vault (library). Kept as a real route so deep links and
                  the sidebar label resolve without a redirect loop. */}
              <Route
                path="/vault"
                element={
                  <RequireAuth>
                    <Library />
                  </RequireAuth>
                }
              />
              <Route
                path="/achievements"
                element={
                  <RequireAuth>
                    <Achievements />
                  </RequireAuth>
                }
              />
              <Route
                path="/plan"
                element={
                  <RequireAuth>
                    <PlanPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </RouteErrorBoundary>
          </Suspense>
        </BrowserRouter>
        </MotionProvider>
        <Toaster />
        </ThemeProvider>
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
