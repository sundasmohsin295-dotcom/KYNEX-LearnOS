import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

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
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
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
      setError("The verification code you entered is incorrect.");
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
        error instanceof Error
          ? error.message
          : "Could not send a new code. Please try again in a moment.",
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
        <Card className="kynex-glass spectrum-border w-full min-w-[300px] max-w-sm rounded-3xl shadow-2xl shadow-primary/10">
          {step === "signIn" && (
            <>
              <CardHeader className="text-center">
                <div className="flex justify-center">
                  <button
                    type="button"
                    aria-label="KYNEX home"
                    className="mb-4 mt-4 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => navigate("/")}
                  >
                    <KynexMark className="size-16" />
                  </button>
                </div>
                <CardTitle className="font-display text-2xl font-bold tracking-tight">
                  Get started
                </CardTitle>
                <CardDescription className="text-sm">
                  Enter your email to log in or sign up
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleEmailSubmit}>
                <CardContent className="space-y-4">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="email"
                        placeholder="name@example.com"
                        type="email"
                        autoComplete="email"
                        className="pl-9"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {error && (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <div className="relative pt-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">
                        Or
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleGuestLogin}
                    disabled={isLoading}
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    Continue as Guest
                  </Button>
                </CardContent>
              </form>
            </>
          )}

          {step === "verify" && (
            <>
              <CardHeader className="text-center">
                <div className="mb-1 mt-4 flex justify-center">
                  <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <KeyRound className="size-5" />
                  </span>
                </div>
                <CardTitle className="font-display text-2xl font-bold tracking-tight">
                  Check your email
                </CardTitle>
                <CardDescription className="text-sm">
                  We sent a 6-digit code to{" "}
                  <span className="font-data font-semibold text-foreground">
                    {email}
                  </span>
                </CardDescription>
              </CardHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitOtp();
                }}
              >
                <CardContent className="pb-4">
                  <div className="flex justify-center">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {error && (
                    <p
                      role="alert"
                      className="mt-2 text-center text-sm text-destructive"
                    >
                      {error}
                    </p>
                  )}
                  {notice && (
                    <p className="mt-2 text-center text-sm text-success">
                      {notice}
                    </p>
                  )}
                  <p className="mt-4 text-center text-sm text-muted-foreground">
                    Didn't receive a code?{" "}
                    {resendIn > 0 ? (
                      <span className="font-data font-semibold">
                        resend in {resendIn}s
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => void handleResend()}
                        disabled={isLoading}
                      >
                        Resend code
                      </Button>
                    )}
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying…
                      </>
                    ) : (
                      <>
                        Verify code
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <div className="flex w-full items-center justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setStep("signIn");
                        setOtp("");
                        setError(null);
                        setNotice(null);
                      }}
                      disabled={isLoading}
                      className="gap-1.5"
                    >
                      <ArrowLeft className="h-4 w-4" /> Different email
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="gap-1.5 text-muted-foreground"
                      onClick={() => {
                        setStep("recover");
                        setError(null);
                        setNotice(null);
                      }}
                      disabled={isLoading}
                    >
                      <LifeBuoy className="h-4 w-4" /> Need help
                    </Button>
                  </div>
                </CardFooter>
              </form>
            </>
          )}

          {step === "recover" && (
            <>
              <CardHeader className="text-center">
                <div className="mb-1 mt-4 flex justify-center">
                  <span className="grid size-11 place-items-center rounded-2xl bg-warning/15 text-warning-foreground">
                    <LifeBuoy className="size-5" />
                  </span>
                </div>
                <CardTitle className="font-display text-2xl font-bold tracking-tight">
                  Can't access this email?
                </CardTitle>
                <CardDescription className="mx-auto max-w-[16rem] text-sm leading-relaxed">
                  Codes expire after 15 minutes. Check spam, verify the address
                  is spelled correctly, or start a guest session now and link
                  your email later.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleGuestLogin}
                  disabled={isLoading}
                >
                  <UserX className="mr-2 h-4 w-4" />
                  Continue as Guest
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void handleResend()}
                  disabled={isLoading || resendIn > 0}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {resendIn > 0
                    ? `Resend available in ${resendIn}s`
                    : "Resend code"}
                </Button>
                <p className="pt-1 text-center text-[11px] leading-relaxed text-muted-foreground">
                  Guest sessions keep everything you build — vault, progress and
                  history stay attached to this browser.
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setStep("verify");
                    setError(null);
                  }}
                  disabled={isLoading}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to verification
                </Button>
              </CardFooter>
            </>
          )}

          <div className="rounded-b-2xl border-t bg-muted/60 px-6 py-4 text-center text-xs text-muted-foreground">
            Secured by{" "}
            <a
              href="https://freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-primary"
            >
              freebuff.com
            </a>
          </div>
        </Card>
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
