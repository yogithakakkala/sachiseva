import { Link, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";

export function Navbar() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  }

  const links: Array<{ to: string; en: string; te: string }> = [
    { to: "/", en: "Home", te: "హోమ్" },
    { to: "/schemes", en: "Schemes", te: "పథకాలు" },
    { to: "/centers", en: "Nearest Center", te: "సచివాలయం" },
    ...(user ? [{ to: "/my-applications", en: "My Applications", te: "నా దరఖాస్తులు" }] : []),
    ...(isAdmin ? [{ to: "/admin", en: "Admin", te: "అడ్మిన్" }] : []),
    { to: "/about", en: "About", te: "గురించి" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
            SS
          </div>
          <div className="leading-tight">
            <div className="font-bold text-primary">SachiSeva</div>
            <div className="text-[11px] text-muted-foreground">సాచిసేవ</div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-secondary hover:text-primary"
              activeProps={{ className: "rounded-md px-3 py-2 text-sm font-medium bg-secondary text-primary" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.en}
            </Link>
          ))}
          {user ? (
            <Button size="sm" variant="outline" onClick={signOut} className="ml-2">
              Sign out
            </Button>
          ) : (
            <Link to="/auth" className="ml-2">
              <Button size="sm">Sign in</Button>
            </Link>
          )}
        </nav>
        <button className="md:hidden p-2" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t bg-white px-4 py-2">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm hover:bg-secondary"
            >
              {l.en} · <span className="text-muted-foreground">{l.te}</span>
            </Link>
          ))}
          {user ? (
            <button
              onClick={() => { setOpen(false); void signOut(); }}
              className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-destructive"
            >
              Sign out
            </button>
          ) : (
            <Link to="/auth" onClick={() => setOpen(false)} className="block rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground mt-1">
              Sign in
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
