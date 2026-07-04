import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, AlertTriangle, Upload, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/apply/$schemeId")({
  component: Apply,
});

function Apply() {
  const { schemeId } = Route.useParams();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [uploaded, setUploaded] = useState<Record<string, { path: string; name: string }>>({});
  const [userDocs, setUserDocs] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const { data: scheme } = useQuery({
    queryKey: ["scheme", schemeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("schemes").select("*").eq("id", schemeId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: offices = [] } = useQuery({
    queryKey: ["offices"],
    queryFn: async () => {
      const { data } = await supabase.from("document_offices").select("*");
      return data ?? [];
    },
  });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: p } = await supabase.from("profiles").select("full_name,phone,uploaded_document_types").eq("id", data.user.id).single();
      if (p) {
        setName(p.full_name ?? "");
        setPhone(p.phone ?? "");
        setUserDocs(p.uploaded_document_types ?? []);
      }
    });
  }, []);

  const missing = useMemo(() => {
    if (!scheme) return [];
    return (scheme.required_documents as string[]).filter((d) => !userDocs.includes(d) && !uploaded[d]);
  }, [scheme, userDocs, uploaded]);

  async function handleUpload(docType: string, file: File) {
    if (!userId) return;
    setUploading(docType);
    try {
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("documents").upload(path, file);
      if (error) throw error;
      setUploaded((u) => ({ ...u, [docType]: { path, name: file.name } }));
      toast.success(`${docType} uploaded`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    if (!scheme || !userId) return;
    setSubmitting(true);
    try {
      const submitted_documents = Object.entries(uploaded).map(([type, v]) => ({ type, path: v.path, name: v.name }));
      // Include docs already on profile
      userDocs
        .filter((d) => (scheme.required_documents as string[]).includes(d))
        .forEach((d) => submitted_documents.push({ type: d, path: "", name: "(from profile)" }));

      const { data, error } = await supabase.from("applications").insert({
        user_id: userId,
        scheme_id: schemeId,
        applicant_name: name,
        applicant_phone: phone,
        notes,
        submitted_documents,
      }).select("id").single();
      if (error) throw error;

      // Also record uploaded doc types on profile so future applications know
      const newTypes = Array.from(new Set([...userDocs, ...Object.keys(uploaded)]));
      await supabase.from("profiles").update({ uploaded_document_types: newTypes, full_name: name, phone }).eq("id", userId);

      toast.success("Application submitted!");
      navigate({ to: "/my-applications/$id", params: { id: data.id } });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!scheme) return <div className="mx-auto max-w-3xl px-4 py-10">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/schemes/$id" params={{ id: schemeId }} className="text-sm text-primary">← Back to scheme</Link>
      <h1 className="mt-2 text-2xl font-bold text-primary">Apply for {scheme.name}</h1>
      {scheme.name_te && <p className="text-muted-foreground">{scheme.name_te}</p>}

      <section className="mt-6 rounded-2xl border bg-card p-5 space-y-3">
        <h2 className="font-semibold">Your details</h2>
        <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <textarea
          className="w-full rounded-md border bg-transparent p-2 text-sm"
          rows={3}
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Required documents</h2>
        <div className="mt-3 space-y-2">
          {(scheme.required_documents as string[]).map((d) => {
            const have = userDocs.includes(d);
            const up = uploaded[d];
            return (
              <div key={d} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  {have || up ? <Check className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-accent-foreground" />}
                  <div>
                    <div className="text-sm font-medium">{d}</div>
                    {have && <div className="text-xs text-muted-foreground">Available in your profile</div>}
                    {up && <div className="text-xs text-muted-foreground">Uploaded: {up.name}</div>}
                  </div>
                </div>
                {!have && (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(d, f); }}
                    />
                    <span className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-secondary">
                      <Upload className="h-3 w-3" /> {uploading === d ? "Uploading…" : up ? "Replace" : "Upload"}
                    </span>
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {missing.length > 0 && (
          <div className="mt-4 rounded-lg bg-accent/15 border border-accent/40 p-4 text-sm">
            <div className="font-semibold text-primary flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Missing documents</div>
            <ul className="mt-2 space-y-1">
              {missing.map((d) => {
                const off = offices.find((o) => o.document_type === d);
                return (
                  <li key={d}>
                    <b>{d}</b> — {off ? <>issued by <b>{off.issuing_office_type}</b>.</> : "issuing office not listed."}
                    {off && (
                      <> <Link to="/centers" className="inline-flex items-center gap-1 text-primary underline"><MapPin className="h-3 w-3" /> find nearest</Link></>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <div className="mt-6">
        <Button size="lg" onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit application"}
        </Button>
      </div>
    </div>
  );
}
