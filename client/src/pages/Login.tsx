import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, KeyRound, Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

type Mode = "login" | "register";

export default function Login() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finish = async (user: unknown) => {
    utils.auth.me.setData(undefined, user as never);
    await utils.auth.me.invalidate();
    setLocation("/");
  };
  const login = trpc.auth.login.useMutation({
    onSuccess: finish,
    onError: issue => setError(issue.message),
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: finish,
    onError: issue => setError(issue.message),
  });
  const pending = login.isPending || register.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (mode === "register") {
      register.mutate({ name, email, password });
    } else {
      login.mutate({ email, password });
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <main className="min-h-screen bg-[#090914] px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center">
        <button
          onClick={() => setLocation("/")}
          className="mb-8 flex w-fit items-center gap-2 text-sm font-semibold text-white/50 transition hover:text-white"
        >
          <ArrowLeft size={16} /> Back to YOB-OS
        </button>
        <section className="rounded-[2rem] border border-white/10 bg-white/[.035] p-6 shadow-2xl shadow-violet-950/20 sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-300 to-cyan-200 text-slate-950">
            {mode === "login" ? <KeyRound size={21} /> : <UserPlus size={21} />}
          </span>
          <p className="mt-6 text-xs font-bold uppercase tracking-[.22em] text-violet-200/70">
            YOB-OS account
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">
            {mode === "login" ? "Welcome back." : "Create your space."}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/55">
            {mode === "login"
              ? "Sign in to access your installed apps, workspace, and publisher controls."
              : "Your email and password create a private YOB-OS account—no external provider is required."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === "register" && (
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-white/65">
                  Name
                </span>
                <Input
                  required
                  value={name}
                  onChange={event => setName(event.target.value)}
                  autoComplete="name"
                  className="h-11 border-white/10 bg-black/20"
                  placeholder="Your name"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-white/65">
                Email
              </span>
              <Input
                required
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="email"
                className="h-11 border-white/10 bg-black/20"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-white/65">
                Password
              </span>
              <Input
                required
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                className="h-11 border-white/10 bg-black/20"
                placeholder="At least 10 characters"
              />
            </label>
            {mode === "register" && (
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-white/65">
                  Confirm password
                </span>
                <Input
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  className="h-11 border-white/10 bg-black/20"
                  placeholder="Repeat your password"
                />
              </label>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={pending}
              className="h-11 w-full rounded-xl bg-cyan-200 font-black text-slate-950 hover:bg-cyan-100"
            >
              {pending && <Loader2 size={16} className="animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-white/50">
            {mode === "login" ? "New to YOB-OS?" : "Already have an account?"}{" "}
            <button
              className="font-bold text-cyan-100 hover:text-white"
              onClick={() =>
                switchMode(mode === "login" ? "register" : "login")
              }
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>
        </section>
      </div>
    </main>
  );
}
