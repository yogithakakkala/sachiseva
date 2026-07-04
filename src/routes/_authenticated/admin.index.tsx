import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminList,
});

const STATUSES = ["submitted", "under_review", "approved", "rejected"] as const;

function AdminList() {
  const [apps, setApps] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { navigate({ to: "/auth" }); return; }
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
      if (!r) {
        setChecking(false);
        return;
      }
      setAllowed(true);
      setChecking(false);
    });
  }, [navigate]);

  useEffect(() => {
    if (!allowed) return;
    async function load() {
      let q = supabase.from("applications").select("*, schemes(name)").order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter as any);
      const { data } = await q;
      setApps(data ?? []);
    }
    void load();
    const ch = supabase.channel("admin-apps").on("postgres_changes", { event: "*", schema: "public", table: "applications" }, () => void load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [allowed, filter]);

  if (checking) return <div className="mx-auto max-w-4xl px-4 py-10">Checking access…</div>;
  if (!allowed) return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-center">
      <h1 className="text-xl font-bold">Admin access only</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your account does not have the admin role.</p>
      <p className="mt-2 text-xs text-muted-foreground">See the About page for how staff accounts are granted admin.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
      <p className="text-muted-foreground">సిబ్బంది డాష్‌బోర్డ్</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {["all", ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-sm ${filter === s ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        {apps.map((a) => (
          <Link key={a.id} to="/admin/$id" params={{ id: a.id }} className="block rounded-xl border bg-card p-4 hover:shadow-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-semibold">{a.schemes?.name}</div>
                <div className="text-xs text-muted-foreground">{a.applicant_name ?? "—"} · {a.applicant_phone ?? "—"} · {new Date(a.created_at).toLocaleString()}</div>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{a.status.replace("_", " ")}</span>
            </div>
          </Link>
        ))}
        {apps.length === 0 && <p className="text-muted-foreground text-sm">No applications.</p>}
      </div>
    </div>
  );
}
