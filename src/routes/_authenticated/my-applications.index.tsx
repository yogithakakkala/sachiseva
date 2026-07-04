import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/my-applications/")({
  component: MyApps,
});

const STATUS_LABEL: Record<string, { en: string; te: string; color: string }> = {
  submitted: { en: "Submitted", te: "సమర్పించబడింది", color: "bg-blue-100 text-blue-800" },
  under_review: { en: "Under Review", te: "పరిశీలనలో", color: "bg-amber-100 text-amber-800" },
  approved: { en: "Approved", te: "ఆమోదించబడింది", color: "bg-green-100 text-green-800" },
  rejected: { en: "Rejected", te: "తిరస్కరించబడింది", color: "bg-red-100 text-red-800" },
};

function MyApps() {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase
        .from("applications")
        .select("*, schemes(name, name_te)")
        .order("created_at", { ascending: false });
      if (mounted) { setApps(data ?? []); setLoading(false); }
    }
    void load();

    // Realtime updates
    const ch = supabase
      .channel("apps-mine")
      .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, () => void load())
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-primary">My Applications</h1>
      <p className="text-muted-foreground">నా దరఖాస్తులు</p>
      {loading && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {!loading && apps.length === 0 && (
        <div className="mt-8 rounded-2xl border bg-card p-8 text-center">
          <p className="text-muted-foreground">No applications yet.</p>
          <Link to="/schemes" className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Browse schemes</Link>
        </div>
      )}
      <div className="mt-6 space-y-3">
        {apps.map((a) => {
          const s = STATUS_LABEL[a.status];
          return (
            <Link key={a.id} to="/my-applications/$id" params={{ id: a.id }} className="block rounded-2xl border bg-card p-4 shadow-sm hover:shadow-md transition">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-primary">{a.schemes?.name}</div>
                  <div className="text-xs text-muted-foreground">{a.schemes?.name_te} · {new Date(a.created_at).toLocaleDateString()}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.color}`}>{s.en} · {s.te}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
