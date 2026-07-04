import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, FileText, ListChecks, Mic, ShieldCheck, Building2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SachiSeva — AP Sachivalayam Services in your pocket" },
      { name: "description", content: "Find your nearest Sachivalayam, apply for welfare schemes and track applications — English & Telugu." },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary to-[oklch(0.28_0.10_258)] text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <p className="text-sm font-medium text-accent">Community Prototype · ప్రజా సేవ</p>
          <h1 className="mt-3 text-4xl md:text-6xl font-bold leading-tight">
            SachiSeva
            <span className="block text-2xl md:text-3xl font-semibold text-accent mt-2">సాచిసేవ</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Andhra Pradesh Sachivalayam services — locate your nearest centre, apply for welfare schemes,
            upload documents, and track applications in real time. In English and తెలుగు.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/schemes" className="rounded-lg bg-accent px-5 py-3 font-semibold text-accent-foreground shadow hover:opacity-90">
              Browse schemes
            </Link>
            <Link to="/centers" className="rounded-lg border border-white/40 bg-white/10 px-5 py-3 font-semibold text-white hover:bg-white/20">
              Nearest Sachivalayam
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-primary">What SachiSeva does</h2>
        <p className="text-center text-muted-foreground mt-2">ఇది ఏమి చేస్తుంది</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: MapPin, en: "Nearest Sachivalayam", te: "దగ్గరి సచివాలయం", d: "GPS + Haversine finds the closest office on an interactive map." },
            { icon: FileText, en: "Scheme Applications", te: "పథకాల దరఖాస్తులు", d: "Apply for YSR Cheyutha, Amma Vodi, Rythu Bharosa and more." },
            { icon: ListChecks, en: "Document Checklist", te: "కాగితాల జాబితా", d: "See what documents are missing and which office issues each one." },
            { icon: ShieldCheck, en: "Realtime Status", te: "నిజ-సమయ స్థితి", d: "Track your application status live — submitted → approved." },
            { icon: Building2, en: "Direct Message Staff", te: "సిబ్బందితో సంభాషణ", d: "Send messages and extra documents linked to each application." },
            { icon: Mic, en: "Voice Assistant", te: "వాయిస్ సహాయకుడు", d: "Ask in Telugu or English — 'నా దగ్గరి సచివాలయం'." },
          ].map(({ icon: Icon, en, te, d }) => (
            <div key={en} className="rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">{en}</div>
                  <div className="text-xs text-muted-foreground">{te}</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-secondary/50 py-12">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h3 className="text-xl font-bold text-primary">Ready to get started?</h3>
          <p className="text-sm text-muted-foreground mt-1">సిద్ధమేనా?</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link to="/auth" className="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">Sign in / Create account</Link>
            <Link to="/about" className="rounded-lg border px-5 py-3 font-semibold">About this project</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
