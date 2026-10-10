"use client";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Location, Participant, Venue } from "@/lib/types";

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
    {participants.map((p, i) => p.location && <CircleMarker key={p.id} center={[p.location.lat, p.location.lng]} radius={9} pathOptions={{ color: "white", weight: 3, fillColor: ["#28645a", "#ca7546", "#5479a5", "#90659b"][i % 4], fillOpacity: 1 }}><Popup><strong>{p.name}</strong><br />{p.mode} · {p.location.label}</Popup></CircleMarker>)}
    {venues.map(v => <CircleMarker key={v.id} center={[v.location.lat, v.location.lng]} radius={v.id === selectedId ? 13 : 7} pathOptions={{ color: v.id === selectedId ? "#28645a" : "#a17d4c", weight: 3, fillColor: v.id === selectedId ? "#c6e3c5" : "#fff", fillOpacity: 1 }}><Popup><strong>{v.name}</strong><br />{v.category}<br />Hours: {v.opening_hours || "unknown"}<br /><a href={`https://www.openstreetmap.org/${v.id}`} target="_blank" rel="noreferrer">View OSM venue</a></Popup></CircleMarker>)}
    {picked && <CircleMarker center={[picked.lat, picked.lng]} radius={10} pathOptions={{ color: "#28645a", fillOpacity: .8 }}><Popup>Your selected starting point</Popup></CircleMarker>}
  </MapContainer>;
}
