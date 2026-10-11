import type { Participant, Room, Venue } from "./types";

export function directionsUrl(venue: Venue, participant: Participant) {
  const params = new URLSearchParams({ api: "1", destination: `${venue.location.lat},${venue.location.lng}`, travelmode: participant.mode === "cycling" ? "bicycling" : participant.mode });
  if (participant.location) params.set("origin", `${participant.location.lat},${participant.location.lng}`);
  return `https://www.google.com/maps/dir/?${params}`;
}

const timestamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
// iCalendar lines are folded by UTF-8 byte length, without splitting characters.
function fold(line: string) {
  let result = "", bytes = 0;
  for (const character of line) {
    const length = new TextEncoder().encode(character).length;
    if (bytes + length > 75) { result += "\r\n "; bytes = 1; }
    result += character; bytes += length;
  }
  return result;
}

export function meetupCalendar(room: Room, venue: Venue, roomUrl: string, now = new Date()) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rendezvous//Meetup//EN", "BEGIN:VEVENT",
    `UID:${room.code}@rendezvous`, `DTSTAMP:${timestamp(now.toISOString())}`, `SEQUENCE:${room.version}`,
    `DTSTART:${timestamp(room.settings.target_arrival)}`, `SUMMARY:${escapeText(`Meetup at ${venue.name}`)}`,
    `LOCATION:${escapeText(`${venue.name} (${venue.location.lat}, ${venue.location.lng})`)}`,
    `GEO:${venue.location.lat};${venue.location.lng}`,
    `DESCRIPTION:${escapeText(`Meetup arrival reminder. Check the room for changes; this calendar file does not update automatically.\n${roomUrl}`)}`,
    "END:VEVENT", "END:VCALENDAR", ""].map(fold).join("\r\n");
}

export function downloadCalendar(room: Room, venue: Venue) {
  const url = URL.createObjectURL(new Blob([meetupCalendar(room, venue, window.location.href)], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `rendezvous-${room.code}.ics`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
