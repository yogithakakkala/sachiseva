import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — SachiSeva" }] }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/my-applications" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/my-applications`,
            data: { full_name: name, phone },
          },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
        navigate({ to: "/my-applications" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/my-applications" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10">
      <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-primary">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "signin" ? "సైన్ ఇన్ చేయండి" : "కొత్త ఖాతా"}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === "signup" && (
            <>
              <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </>
          )}
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 text-sm text-primary underline w-full text-center"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>

        <p className="mt-4 text-xs text-muted-foreground text-center">
          By continuing you agree this is a community prototype. <Link to="/about" className="underline">Learn more</Link>.
        </p>
      </div>
    </div>
  );
}
