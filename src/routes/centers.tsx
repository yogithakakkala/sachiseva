import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/use-geolocation";
import { haversineKm } from "@/lib/haversine";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { defaultIcon, nearestIcon, userIcon } from "@/lib/leaflet-icons";
import { MapPin, Phone } from "lucide-react";

export const Route = createFileRoute("/centers")({
  head: () => ({
    meta: [
      { title: "Nearest Sachivalayam — SachiSeva" },
      { name: "description", content: "Locate your nearest Sachivalayam centre in Andhra Pradesh." },
    ],
  }),
  ssr: false,
  component: Centers,
});

function Centers() {
  const { coords, error } = useGeolocation();
  const { data: centers = [] } = useQuery({
    queryKey: ["centers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sachivalayam_centers").select("*");
      if (error) throw error;
      return data;
    },
  });

  const sorted = useMemo(() => {
    if (!coords) return centers.map((c) => ({ ...c, dist: null as number | null }));
    return centers
      .map((c) => ({ ...c, dist: haversineKm(coords, { lat: c.latitude, lng: c.longitude }) }))
      .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
  }, [centers, coords]);

  const nearestId = sorted[0]?.id;
  const center: [number, number] = coords ? [coords.lat, coords.lng] : [16.5, 80.6];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold text-primary">Nearest Sachivalayam</h1>
      <p className="text-muted-foreground">దగ్గరి సచివాలయం</p>
      {error && <p className="mt-3 text-sm text-destructive">Location unavailable — showing all centres. ({error})</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,340px]">
        <div className="h-[520px] overflow-hidden rounded-2xl border">
          <MapContainer center={center} zoom={coords ? 11 : 7} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {coords && (
              <Marker position={[coords.lat, coords.lng]} icon={userIcon}>
                <Popup>You are here</Popup>
              </Marker>
            )}
            {sorted.map((c) => (
              <Marker
                key={c.id}
                position={[c.latitude, c.longitude]}
                icon={c.id === nearestId && coords ? nearestIcon : defaultIcon}
              >
                <Popup>
                  <b>{c.name}</b><br />
                  {c.address}<br />
                  {c.phone && <>📞 {c.phone}</>}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <div className="max-h-[520px] overflow-auto rounded-2xl border bg-card">
          {sorted.map((c) => (
            <div key={c.id} className={`border-b p-4 ${c.id === nearestId && coords ? "bg-accent/20" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-primary flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {c.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{c.mandal}, {c.district}</div>
                  <div className="text-sm mt-1">{c.address}</div>
                  {c.phone && <div className="text-xs mt-1 flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</div>}
                </div>
                {c.dist !== null && (
                  <div className="text-xs font-semibold text-primary shrink-0">{c.dist.toFixed(1)} km</div>
                )}
              </div>
              {c.id === nearestId && coords && (
                <div className="mt-2 text-xs font-bold text-accent-foreground">★ Nearest to you</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
