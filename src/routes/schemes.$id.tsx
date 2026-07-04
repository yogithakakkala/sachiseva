import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Check } from "lucide-react";

export const Route = createFileRoute("/schemes/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Scheme details — SachiSeva` }, { name: "description", content: `Eligibility and required documents for scheme ${params.id}.` }],
  }),
  component: SchemeDetail,
});

function SchemeDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["scheme", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="mx-auto max-w-3xl px-4 py-10 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="mx-auto max-w-3xl px-4 py-10">Scheme not found.</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/schemes" className="text-sm text-primary">← All schemes</Link>
      <h1 className="mt-2 text-3xl font-bold text-primary">{data.name}</h1>
      {data.name_te && <p className="text-muted-foreground">{data.name_te}</p>}
      <p className="mt-4">{data.description}</p>

      <section className="mt-6 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold text-primary">Eligibility · అర్హత</h2>
        <p className="mt-2 text-sm">{data.eligibility}</p>
      </section>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold text-primary">Required documents · అవసరమైన కాగితాలు</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.required_documents.map((d: string) => (
            <li key={d} className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 text-accent" /> {d}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6">
        {user ? (
          <Link to="/apply/$schemeId" params={{ schemeId: id }} className="inline-block rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">
            Apply now · ఇప్పుడు దరఖాస్తు చేయండి
          </Link>
        ) : (
          <Link to="/auth" className="inline-block rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">
            Sign in to apply
          </Link>
        )}
      </div>
    </div>
  );
}
