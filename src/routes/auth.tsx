import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BookOpen, ArrowLeft, Mail, KeyRound, CheckCircle2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
const signUpSchema = signInSchema.extend({
  full_name: z.string().trim().min(2, "Tell us your name").max(60),
});
const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: (s.redirect as string) ?? "/" }),
  head: () => ({
    meta: [
      { title: "Sign in or create an account — CampusCache" },
      { name: "description", content: "Sign in to contribute notes, PPTs and lab files. Free for every student." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot" | "forgot-sent";

function AuthPage() {
  const { user, loading } = useAuth();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    if (!loading && user) navigate({ to: redirect as never });
  }, [user, loading, redirect, navigate]);

  const signInForm = useForm({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });
  const signUpForm = useForm({ resolver: zodResolver(signUpSchema), defaultValues: { email: "", password: "", full_name: "" } });
  const forgotForm = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  const handleSignIn = async (v: z.infer<typeof signInSchema>) => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(v);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Welcome back"); navigate({ to: redirect as never }); }
  };

  const handleSignUp = async (v: z.infer<typeof signUpSchema>) => {
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: v.full_name },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Account created — you're in"); navigate({ to: redirect as never }); }
  };

  const handleForgotPassword = async (v: z.infer<typeof forgotSchema>) => {
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(v.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSentTo(v.email);
      setMode("forgot-sent");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <Link to="/" className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-soft">
              <BookOpen className="h-6 w-6" />
            </Link>
            <h1 className="mt-6 font-serif text-4xl text-foreground">
              {mode === "signin" && <><span className="italic-serif text-gradient-primary">Welcome</span> back</>}
              {mode === "signup" && <>Join <span className="italic-serif text-gradient-primary">CampusCache</span></>}
              {mode === "forgot" && <>Reset your <span className="italic-serif text-gradient-primary">password</span></>}
              {mode === "forgot-sent" && <>Check your <span className="italic-serif text-gradient-primary">inbox</span></>}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "signin" && "Sign in to contribute and track your uploads."}
              {mode === "signup" && "Create an account in seconds — no email confirmation needed."}
              {mode === "forgot" && "Enter your email and we'll send you a password reset link."}
              {mode === "forgot-sent" && `We've sent a reset link to ${sentTo}`}
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/60 p-8">

            {/* ── Sign In ── */}
            {mode === "signin" && (
              <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...signInForm.register("email")} className="mt-2 bg-background" autoComplete="email" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => { forgotForm.setValue("email", signInForm.getValues("email")); setMode("forgot"); }}
                      className="text-xs text-mint hover:underline underline-offset-4"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input id="password" type="password" {...signInForm.register("password")} className="bg-background" autoComplete="current-password" />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 h-11">
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            )}

            {/* ── Sign Up ── */}
            {mode === "signup" && (
              <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
                <div>
                  <Label htmlFor="full_name">Full name</Label>
                  <Input id="full_name" {...signUpForm.register("full_name")} className="mt-2 bg-background" autoComplete="name" />
                </div>
                <div>
                  <Label htmlFor="email2">Email</Label>
                  <Input id="email2" type="email" {...signUpForm.register("email")} className="mt-2 bg-background" autoComplete="email" />
                </div>
                <div>
                  <Label htmlFor="password2">Password</Label>
                  <Input id="password2" type="password" {...signUpForm.register("password")} className="mt-2 bg-background" autoComplete="new-password" />
                  <p className="text-xs text-muted-foreground mt-1">At least 6 characters</p>
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 h-11">
                  {busy ? "Creating…" : "Create account"}
                </Button>
              </form>
            )}

            {/* ── Forgot Password ── */}
            {mode === "forgot" && (
              <form onSubmit={forgotForm.handleSubmit(handleForgotPassword)} className="space-y-4">
                <div>
                  <Label htmlFor="forgot-email">Email address</Label>
                  <div className="relative mt-2">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="forgot-email" type="email" {...forgotForm.register("email")} className="pl-9 bg-background" autoComplete="email" placeholder="you@example.com" />
                  </div>
                  {forgotForm.formState.errors.email && (
                    <p className="text-xs text-destructive mt-1">{forgotForm.formState.errors.email.message}</p>
                  )}
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 h-11">
                  <KeyRound className="h-4 w-4" />
                  {busy ? "Sending…" : "Send reset link"}
                </Button>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </button>
              </form>
            )}

            {/* ── Reset Sent ── */}
            {mode === "forgot-sent" && (
              <div className="text-center py-4 space-y-4">
                <div className="h-16 w-16 rounded-full bg-mint/10 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-8 w-8 text-mint" />
                </div>
                <p className="text-sm text-muted-foreground">
                  If an account exists for <span className="text-foreground font-medium">{sentTo}</span>, you'll receive an email with a reset link within a few minutes.
                </p>
                <p className="text-xs text-muted-foreground">Check your spam folder if you don't see it.</p>
                <button
                  onClick={() => setMode("signin")}
                  className="text-sm text-mint hover:underline underline-offset-4 flex items-center gap-1.5 mx-auto"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </button>
              </div>
            )}
          </div>

          {(mode === "signin" || mode === "signup") && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-mint hover:underline underline-offset-4">
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
