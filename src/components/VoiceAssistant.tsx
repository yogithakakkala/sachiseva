import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

type Lang = "en-IN" | "te-IN";

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  start: () => void;
  stop: () => void;
}

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

async function answerIntent(text: string, lang: Lang, navigate: (o: any) => void): Promise<string> {
  const t = text.toLowerCase();
  const te = lang === "te-IN";

  // Nearest center
  if (/(near|nearest|centre|center|sachivalayam|దగ్గర|సచివాలయ)/i.test(t)) {
    navigate({ to: "/centers" });
    return te
      ? "మీ దగ్గరి సచివాలయాన్ని మ్యాప్‌లో చూపిస్తున్నాను."
      : "Opening the nearest Sachivalayam on the map.";
  }
  // Application status
  if (/(status|my application|track|దరఖాస్తు|స్థితి)/i.test(t)) {
    navigate({ to: "/my-applications" });
    return te ? "మీ దరఖాస్తుల స్థితిని చూపిస్తున్నాను." : "Showing your application status.";
  }
  // How to apply for X
  const applyMatch = t.match(/apply(?:\s+for)?\s+(.+)/i);
  if (applyMatch || /దరఖాస్తు/.test(t)) {
    const q = applyMatch?.[1] ?? text;
    const { data } = await supabase.from("schemes").select("id,name,name_te").limit(20);
    const match = data?.find((s) =>
      (s.name + " " + (s.name_te ?? "")).toLowerCase().includes(q.toLowerCase().slice(0, 20)),
    );
    if (match) {
      navigate({ to: "/schemes/$id", params: { id: match.id } });
      return te ? `${match.name_te ?? match.name} పథకం వివరాలు తెరుస్తున్నాను.` : `Opening ${match.name}.`;
    }
    navigate({ to: "/schemes" });
    return te ? "అన్ని పథకాలను చూపిస్తున్నాను." : "Here are all schemes.";
  }
  // Documents
  if (/(document|papers|కాగితాలు|డాక్యుమెంట్)/i.test(t)) {
    return te
      ? "పథకం ఎంచుకోండి, అవసరమైన కాగితాల జాబితా చూపిస్తాను."
      : "Open a scheme to see the required documents checklist.";
  }
  if (/(help|what can you do|సహాయం)/i.test(t)) {
    return te
      ? "నేను పథకాలు, దరఖాస్తు స్థితి, దగ్గరి సచివాలయం గురించి సహాయం చేస్తాను."
      : "I can help with schemes, application status, and the nearest Sachivalayam.";
  }
  return te
    ? "క్షమించండి, అర్థం కాలేదు. 'నా దగ్గరి సచివాలయం' లేదా 'రైతు భరోసా కోసం దరఖాస్తు' అని అడగండి."
    : "Sorry, I didn't catch that. Try 'nearest center' or 'apply for Rythu Bharosa'.";
}

function speak(text: string, lang: Lang) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function VoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("en-IN");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [supported, setSupported] = useState(true);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setSupported(!!getRecognition());
  }, []);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = async (e: any) => {
      const said = e.results[0][0].transcript as string;
      setTranscript(said);
      const ans = await answerIntent(said, lang, navigate);
      setReply(ans);
      speak(ans, lang);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setTranscript("");
    setReply("");
    setListening(true);
    rec.start();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg hover:scale-105 transition"
        aria-label="Voice assistant"
      >
        <Mic className="h-6 w-6" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-primary">Voice Assistant</div>
                <div className="text-xs text-muted-foreground">వాయిస్ సహాయకుడు</div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              <button onClick={() => setLang("en-IN")} className={`rounded-full px-3 py-1 ${lang === "en-IN" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>English</button>
              <button onClick={() => setLang("te-IN")} className={`rounded-full px-3 py-1 ${lang === "te-IN" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>తెలుగు</button>
            </div>
            {!supported ? (
              <p className="mt-4 text-sm text-destructive">
                Voice input isn't supported in this browser. Please try Chrome on Android or desktop.
              </p>
            ) : (
              <>
                <div className="mt-4 flex flex-col items-center">
                  <Button size="lg" onClick={toggle} className={listening ? "bg-destructive" : ""}>
                    {listening ? <><MicOff className="mr-2 h-4 w-4" /> Stop</> : <><Mic className="mr-2 h-4 w-4" /> Tap to speak</>}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {lang === "te-IN" ? "ఉదా: 'నా దగ్గరి సచివాలయం'" : "e.g. 'Nearest center', 'Apply for Amma Vodi'"}
                  </p>
                </div>
                {transcript && (
                  <div className="mt-4 rounded-lg bg-muted p-3 text-sm"><b>You:</b> {transcript}</div>
                )}
                {reply && (
                  <div className="mt-2 rounded-lg bg-secondary p-3 text-sm flex gap-2 items-start">
                    <Volume2 className="h-4 w-4 mt-0.5 shrink-0" /> <span>{reply}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
