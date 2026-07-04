import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, Send, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/my-applications/$id")({
  component: AppDetail,
});

const STATUS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function AppDetail() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    async function load() {
      const { data } = await supabase.from("applications").select("*, schemes(name,name_te,required_documents)").eq("id", id).single();
      setApp(data);
      const { data: msgs } = await supabase.from("application_messages").select("*").eq("application_id", id).order("created_at");
      setMessages(msgs ?? []);
    }
    void load();
    const ch = supabase
      .channel(`app-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "applications", filter: `id=eq.${id}` }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "application_messages", filter: `application_id=eq.${id}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  async function sendMessage() {
    if (!body.trim() || !userId) return;
    const { error } = await supabase.from("application_messages").insert({ application_id: id, sender_id: userId, body });
    if (error) return toast.error(error.message);
    setBody("");
  }

  async function sendFile(file: File) {
    if (!userId) return;
    setUploading(true);
    try {
      const path = `${userId}/msg-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("documents").upload(path, file);
      if (error) throw error;
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 60 * 24 * 7);
      await supabase.from("application_messages").insert({
        application_id: id,
        sender_id: userId,
        body: `Attached: ${file.name}`,
        attachment_url: signed?.signedUrl ?? path,
        attachment_name: file.name,
      });
      toast.success("Document sent");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  if (!app) return <div className="mx-auto max-w-3xl px-4 py-10">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/my-applications" className="text-sm text-primary">← All applications</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">{app.schemes?.name}</h1>
          <p className="text-xs text-muted-foreground">Application ID: {app.id.slice(0, 8)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS[app.status]}`}>{app.status.replace("_", " ")}</span>
      </div>

      <section className="mt-6 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold text-primary">Submitted documents</h2>
        <ul className="mt-2 text-sm space-y-1">
          {(app.submitted_documents ?? []).map((d: any, i: number) => (
            <li key={i} className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> {d.type} <span className="text-muted-foreground">— {d.name}</span></li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold text-primary">Messages with staff</h2>
        <div className="mt-3 space-y-2 max-h-72 overflow-auto">
          {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`rounded-lg p-3 text-sm ${m.sender_id === userId ? "bg-primary/10 ml-8" : "bg-secondary mr-8"}`}>
              <div className="text-xs text-muted-foreground mb-1">
                {m.sender_id === userId ? "You" : "Staff"} · {new Date(m.created_at).toLocaleString()}
              </div>
              <div>{m.body}</div>
              {m.attachment_url && (
                <a href={m.attachment_url} target="_blank" rel="noreferrer" className="text-primary underline text-xs mt-1 inline-block">
                  {m.attachment_name ?? "Attachment"}
                </a>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <textarea className="flex-1 rounded-md border p-2 text-sm" rows={2} placeholder="Type a message…" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex flex-col gap-2">
            <Button onClick={sendMessage} size="sm"><Send className="h-4 w-4" /></Button>
            <label className="cursor-pointer">
              <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void sendFile(f); }} />
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-2 text-xs hover:bg-secondary">
                <Upload className="h-3 w-3" /> {uploading ? "…" : "File"}
              </span>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
