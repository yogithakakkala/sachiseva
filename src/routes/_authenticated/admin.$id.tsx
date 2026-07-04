import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/$id")({
  component: AdminDetail,
});

const STATUSES = ["submitted", "under_review", "approved", "rejected"] as const;

function AdminDetail() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [signedDocs, setSignedDocs] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    async function load() {
      const { data } = await supabase.from("applications").select("*, schemes(name,name_te), profiles(full_name,email,phone)").eq("id", id).single();
      setApp(data);
      const { data: msgs } = await supabase.from("application_messages").select("*").eq("application_id", id).order("created_at");
      setMessages(msgs ?? []);
      // Sign URLs for uploaded docs
      const docs = (data?.submitted_documents ?? []) as Array<{ type: string; path: string; name: string }>;
      const urls: Record<number, string> = {};
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        if (d.path) {
          const { data: s } = await supabase.storage.from("documents").createSignedUrl(d.path, 60 * 60);
          if (s?.signedUrl) urls[i] = s.signedUrl;
        }
      }
      setSignedDocs(urls);
    }
    void load();
    const ch = supabase.channel(`admin-app-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "application_messages", filter: `application_id=eq.${id}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  async function updateStatus(status: string) {
    setSaving(true);
    // NOTE: A DB trigger + edge notification would email the applicant here.
    // TODO: plug real SMS gateway (Fast2SMS / Twilio) here to notify by SMS.
    const { error } = await supabase.from("applications").update({ status: status as any }).eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Status updated to ${status.replace("_", " ")}`);
  }

  async function sendMessage() {
    if (!body.trim() || !userId) return;
    const { error } = await supabase.from("application_messages").insert({ application_id: id, sender_id: userId, body });
    if (error) return toast.error(error.message);
    setBody("");
  }

  if (!app) return <div className="mx-auto max-w-3xl px-4 py-10">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/admin" className="text-sm text-primary">← All applications</Link>
      <h1 className="mt-2 text-2xl font-bold text-primary">{app.schemes?.name}</h1>
      <p className="text-xs text-muted-foreground">ID: {app.id.slice(0, 8)}</p>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Applicant</h2>
        <p className="text-sm mt-1">{app.applicant_name ?? app.profiles?.full_name} · {app.applicant_phone ?? app.profiles?.phone} · {app.profiles?.email}</p>
        {app.notes && <p className="text-sm mt-2 text-muted-foreground">Notes: {app.notes}</p>}
      </section>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Status</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={app.status === s ? "default" : "outline"}
              disabled={saving}
              onClick={() => updateStatus(s)}
            >
              {s.replace("_", " ")}
            </Button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Submitted documents</h2>
        <ul className="mt-2 text-sm space-y-1">
          {(app.submitted_documents ?? []).map((d: any, i: number) => (
            <li key={i} className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>{d.type}</span>
              {signedDocs[i] ? (
                <a href={signedDocs[i]} target="_blank" rel="noreferrer" className="text-primary underline text-xs">open</a>
              ) : (
                <span className="text-xs text-muted-foreground">— {d.name}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Messages</h2>
        <div className="mt-3 space-y-2 max-h-72 overflow-auto">
          {messages.map((m) => (
            <div key={m.id} className={`rounded-lg p-3 text-sm ${m.sender_id === userId ? "bg-primary/10 ml-8" : "bg-secondary mr-8"}`}>
              <div className="text-xs text-muted-foreground mb-1">{m.sender_id === userId ? "You (staff)" : "Applicant"} · {new Date(m.created_at).toLocaleString()}</div>
              <div>{m.body}</div>
              {m.attachment_url && <a href={m.attachment_url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">{m.attachment_name ?? "Attachment"}</a>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <textarea className="flex-1 rounded-md border p-2 text-sm" rows={2} placeholder="Reply to applicant…" value={body} onChange={(e) => setBody(e.target.value)} />
          <Button onClick={sendMessage} size="sm"><Send className="h-4 w-4" /></Button>
        </div>
      </section>
    </div>
  );
}
