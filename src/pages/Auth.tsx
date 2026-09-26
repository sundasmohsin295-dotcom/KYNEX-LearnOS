import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

import { useAuth } from "@/hooks/use-auth";
import { resolveRedirectAfterAuth } from "@/lib/redirect";
import { KynexMark } from "@/components/brand/KynexBrand";
import { KynexAuthShell } from "@/components/brand/KynexAuthShell";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  LifeBuoy,
  Loader2,
  Mail,
  UserX,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

/** Cooldown before the OTP resend affordance re-enables (seconds). */
const RESEND_COOLDOWN_S = 30;

type Step = "signIn" | "verify" | "recover";

/**
 * AUTH SUITE — centered spatial card, rounded-2xl inputs, enumeration-safe
 * errors. Every failure that could reveal whether an account exists is worded
 * identically regardless of account state (OTP sign-in is enumeration-proof
 * by contract: "log in or sign up" from one field).
 */
function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<Step>("signIn");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  // Resend cooldown ticker — one timeout per tick, self-clearing.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData(event.currentTarget);
      const submitted = String(formData.get("email") ?? "").trim();
      await signIn("email-otp", formData);
      setEmail(submitted);
      setStep("verify");
      setResendIn(RESEND_COOLDOWN_S);
    } catch (error) {
      console.error("Email sign-in error:", error);
      // Enumeration-safe: identical wording whether or not the address exists.
      setError(
        "We couldn't send a code to that address. Double-check it and try again in a moment.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const submitOtp = useCallback(async () => {
    if (otp.length !== 6 || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("email", email);
      formData.set("code", otp);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      // Enumeration-safe: never distinguish "no account" from "wrong code".
      setError("That code didn't work. Request a fresh one or check the address.");
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  }, [otp, email, isLoading, signIn, navigate, redirect]);

  const handleResend = useCallback(async () => {
    if (resendIn > 0 || isLoading || !email) return;
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.set("email", email);
      await signIn("email-otp", formData);
      setResendIn(RESEND_COOLDOWN_S);
      setNotice(`A fresh code was sent to ${email}.`);
    } catch (error) {
      console.error("OTP resend error:", error);
      setError(
        "We couldn't send a new code right now. Please try again in a moment.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [email, resendIn, isLoading, signIn]);

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      // Account-enumeration neutralization: the failure detail stays in the
      // console log; the student sees one indistinguishable generic message.
      console.error("Guest login error:", error);
      setError("Couldn't start a guest session. Please try again in a moment.");
      setIsLoading(false);
    }
  };

  return (
    <KynexAuthShell quote="Turn studying into intelligence.">
      <div className="flex w-full flex-1 items-center justify-center">
        {/* Centered spatial card: quiet paper surface, hairline border,
            generous internal rhythm — no heavy glass, no floating orbs. */}
        <div className="w-full max-w-sm rounded-3xl border border-border/80 bg-card/95 p-7 shadow-[0_16px_48px_-28px_oklch(0.45_0.04_60/0.22)] sm:p-8">
          {step === "signIn" && (
            <>
              <div className="flex flex-col items-center text-center">
                <button
                  type="button"
                  aria-label="KYNEX home"
                  className="cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => navigate("/")}
                >
                  <KynexMark className="size-14" />
                </button>
                <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
                  Welcome to KYNEX
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  One code logs you in — or signs you up.
                </p>
              </div>

              <form onSubmit={handleEmailSubmit} className="mt-7 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="kynex-email" className="text-sm font-medium">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="kynex-email"
                      name="email"
                      placeholder="name@example.com"
                      type="email"
                      autoComplete="email"
                      className="h-11 rounded-2xl pl-10"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>
                {error && (
                  <p role="alert" className="text-sm leading-relaxed text-destructive">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="h-11 w-full rounded-2xl text-[15px] font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending your code…
                    </>
                  ) : (
                    <>
                      Continue with email
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-xs uppercase tracking-wider text-muted-foreground">
                    or
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-2xl font-medium"
                onClick={handleGuestLogin}
                disabled={isLoading}
              >
                <UserX className="mr-2 h-4 w-4" />
                Continue as guest
              </Button>

              <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
                Guest sessions keep everything you build — vault, progress and
                history stay attached to this browser.
              </p>
            </>
          )}

          {step === "verify" && (
            <>
              <div className="flex flex-col items-center text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <KeyRound className="size-5" />
                </span>
                <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
                  Check your email
                </h1>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  We sent a 6-digit code to{" "}
                  <span className="font-data font-semibold text-foreground">
                    {email}
                  </span>
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitOtp();
                }}
                className="mt-7 space-y-4"
              >
                {/* OTP auto-advance: Radix InputOTP moves focus between slots
                    on entry and on backspace; Enter submits when complete. */}
                <div className="flex justify-center">
                  <InputOTP
                    value={otp}
                    onChange={setOtp}
                    maxLength={6}
                    disabled={isLoading}
                  >
                    <InputOTPGroup className="gap-2">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot
                          key={index}
                          index={index}
                          className="rounded-2xl border-border/80"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {error && (
                  <p
                    role="alert"
                    className="text-center text-sm leading-relaxed text-destructive"
                  >
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="text-center text-sm text-success">{notice}</p>
                )}
                <Button
                  type="submit"
                  className="h-11 w-full rounded-2xl text-[15px] font-semibold"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    <>
                      Verify and continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-5 flex items-center justify-between text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto gap-1.5 p-0 text-muted-foreground"
                  onClick={() => {
                    setStep("signIn");
                    setOtp("");
                    setError(null);
                    setNotice(null);
                  }}
                  disabled={isLoading}
                >
                  <ArrowLeft className="h-4 w-4" /> Different email
                </Button>
                {resendIn > 0 ? (
                  <span className="font-data text-muted-foreground" aria-live="polite">
                    resend in {resendIn}s
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto p-0 font-semibold text-primary"
                    onClick={() => void handleResend()}
                    disabled={isLoading}
                  >
                    Resend code
                  </Button>
                )}
              </div>

              <div className="mt-5 border-t border-border/70 pt-4 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto gap-1.5 p-0 text-sm text-muted-foreground"
                  onClick={() => {
                    setStep("recover");
                    setError(null);
                    setNotice(null);
                  }}
                  disabled={isLoading}
                >
                  <LifeBuoy className="h-4 w-4" /> Not getting the code?
                </Button>
              </div>
            </>
          )}

          {step === "recover" && (
            <>
              <div className="flex flex-col items-center text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-warning/15 text-warning-foreground">
                  <LifeBuoy className="size-5" />
                </span>
                <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
                  Not getting the code?
                </h1>
                <p className="mt-1.5 max-w-[17rem] text-sm leading-relaxed text-muted-foreground">
                  Codes expire after 15 minutes. Check spam, confirm the address
                  is spelled correctly, or start a guest session now.
                </p>
              </div>

              <div className="mt-7 space-y-2.5">
                <Button
                  type="button"
                  className="h-11 w-full rounded-2xl text-[15px] font-semibold"
                  onClick={handleGuestLogin}
                  disabled={isLoading}
                >
                  <UserX className="mr-2 h-4 w-4" />
                  Continue as guest
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-2xl font-medium"
                  onClick={() => void handleResend()}
                  disabled={isLoading || resendIn > 0}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {resendIn > 0
                    ? `Resend available in ${resendIn}s`
                    : "Try my email again"}
                </Button>
              </div>

              <div className="mt-6 border-t border-border/70 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full gap-1.5 text-sm text-muted-foreground"
                  onClick={() => {
                    setStep("verify");
                    setError(null);
                  }}
                  disabled={isLoading}
                >
                  <ArrowLeft className="h-4 w-4" /> Back to verification
                </Button>
              </div>
            </>
          )}

          <p className="mt-7 text-center text-[11px] leading-relaxed text-muted-foreground">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </KynexAuthShell>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
