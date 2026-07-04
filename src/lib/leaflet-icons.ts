import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Default marker (blue)
export const defaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Highlighted nearest marker (orange saffron)
export const nearestIcon = L.divIcon({
  className: "",
  html: `<div style="background:#F0A500;border:3px solid #0A3D7E;width:22px;height:22px;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export const userIcon = L.divIcon({
  className: "",
  html: `<div style="background:#0A3D7E;border:3px solid #fff;width:18px;height:18px;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
