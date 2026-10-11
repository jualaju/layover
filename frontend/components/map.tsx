"use client";
import { useEffect } from "react";
import { Marker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Location, Participant, Venue } from "@/lib/types";

// Only fixed SVG paths/palette colors enter this HTML; names stay React popup text.
function pixelMarker(kind: "person" | "venue" | "star" | "pin", color = "#678d47") {
  const paths = {
    person: `<path d="M6 1h8v2h2v8h-2v2h3v7h-3v3h-4v-5H8v5H4v-3H1v-7h3v-2H2V3h4Z" fill="#23352e"/><path d="M6 4h7v6H6Z" fill="#efd6ae"/><path d="M4 14h10v5H4Z" fill="${color}"/><path d="M7 6h2v2H7Zm5 0h2v2h-2Z" fill="#23352e"/>`,
    venue: '<path d="M3 3h18v3h2v5h-2v10H3V11H1V6h2Z" fill="#23352e"/><path d="M5 11h14v8H5Z" fill="#f3edcf"/><path d="M3 6h18v3H3Z" fill="#c76243"/><path d="M5 6h3v3H5Zm6 0h3v3h-3Zm6 0h3v3h-3Z" fill="#f3edcf"/><path d="M10 14h4v7h-4Z" fill="#98724a"/>',
    star: '<path d="M10 1h4v6h6v3h3v4h-6v3h3v6h-6v-3h-4v3H4v-6h3v-3H1v-4h3V7h6Z" fill="#f2d36c" stroke="#23352e" stroke-width="2"/><path d="M9 10h2v3H9Zm5 0h2v3h-2Z" fill="#23352e"/>',
    pin: '<path d="M6 1h12v3h3v12h-3v3h-3v3h-3v2H9v-5H6v-3H3V4h3Z" fill="#23352e"/><path d="M6 4h12v11h-3v3h-3v3H9v-6H6Z" fill="#c76243"/><path d="M9 7h6v6H9Z" fill="#f3edcf"/>',
  };
  const size = kind === "star" ? 38 : 30;
  return L.divIcon({ className: "pixel-map-marker", html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">${paths[kind]}</svg>`, iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size] });
}

function Controls({ locations, onPick }: { locations: Location[]; onPick?: (location: Location) => void }) {
  const map = useMap();
  useMapEvents({ click: event => onPick?.({ lat: event.latlng.lat, lng: event.latlng.lng, label: `Map pin (${event.latlng.lat.toFixed(4)}, ${event.latlng.lng.toFixed(4)})` }) });
  const coordinates = locations.map(p => `${p.lat},${p.lng}`).join(";");
  useEffect(() => {
    const points = coordinates.split(";").filter(Boolean).map(p => p.split(",").map(Number) as [number, number]);
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [45, 45], maxZoom: 15, animate: false });
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map, coordinates]);
  return null;
}
export default function MeetingMap({ participants = [], venues = [], selectedId, picked, onPick }: { participants?: Participant[]; venues?: Venue[]; selectedId?: string | null; picked?: Location | null; onPick?: (location: Location) => void }) {
  const locations = [...participants.flatMap(p => p.location ? [p.location] : []), ...venues.map(v => v.location), ...(picked ? [picked] : [])];
  return <MapContainer center={[12.9716, 77.5946]} zoom={13} className="meeting-map" scrollWheelZoom={false} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false}>
    <TileLayer url={process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
    <Controls locations={locations} onPick={onPick} />
    {participants.map((p, i) => p.location && <Marker key={p.id} position={[p.location.lat, p.location.lng]} icon={pixelMarker("person", ["#678d47", "#ce6847", "#79a4c2", "#ad80ac"][i % 4])} title={p.name} alt={`${p.name}'s starting point`}><Popup><strong>{p.name}</strong><br />{p.mode} · {p.location.label}</Popup></Marker>)}
    {venues.map(v => <Marker key={v.id} position={[v.location.lat, v.location.lng]} icon={pixelMarker(v.id === selectedId ? "star" : "venue")} title={v.name} alt={`${v.name}${v.id === selectedId ? ", selected meeting point" : ", candidate venue"}`}><Popup><strong>{v.name}</strong><br />{v.category}<br />Hours: {v.opening_hours || "unknown"}<br /><a href={`https://www.openstreetmap.org/${v.id}`} target="_blank" rel="noreferrer">View OSM venue</a></Popup></Marker>)}
    {picked && <Marker position={[picked.lat, picked.lng]} icon={pixelMarker("pin")} title="Your selected starting point" alt="Your selected starting point"><Popup>Your selected starting point</Popup></Marker>}
  </MapContainer>;
}
