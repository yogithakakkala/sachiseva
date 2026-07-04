import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/schemes/")({
  head: () => ({
    meta: [
      { title: "Welfare Schemes — SachiSeva" },
      { name: "description", content: "Browse Andhra Pradesh welfare schemes: YSR Cheyutha, Amma Vodi, Rythu Bharosa, Aarogyasri and more." },
    ],
  }),
  component: SchemesList,
});

function SchemesList() {
  const { data, isLoading } = useQuery({
    queryKey: ["schemes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-primary">Welfare Schemes</h1>
      <p className="text-muted-foreground">సంక్షేమ పథకాలు</p>
      {isLoading && <p className="mt-6 text-muted-foreground">Loading…</p>}
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.map((s) => (
          <Link key={s.id} to="/schemes/$id" params={{ id: s.id }} className="rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition">
            <div className="text-xs uppercase tracking-wide text-accent-foreground/70">{s.category}</div>
            <h3 className="mt-1 font-semibold text-primary">{s.name}</h3>
            {s.name_te && <div className="text-xs text-muted-foreground">{s.name_te}</div>}
            <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{s.description}</p>
            <div className="mt-3 text-xs font-medium text-primary">View details →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
