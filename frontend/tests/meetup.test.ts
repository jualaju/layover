import { expect, it } from "vitest";
import { directionsUrl, meetupCalendar } from "@/lib/meetup";
import { parseSession } from "@/lib/api";
import type { Participant, Room, Venue } from "@/lib/types";
const venue = { name: "Café, friends;\nBEGIN:VEVENT", location: { lat: 12, lng: 77 } } as Venue;
it("opens directions with the participant's travel mode and origin", () => {
  const url = new URL(directionsUrl(venue, { mode: "cycling", location: { lat: 13, lng: 78 } } as Participant));
  expect(url.searchParams.get("travelmode")).toBe("bicycling");
  expect(url.searchParams.get("origin")).toBe("13,78");
  expect(url.searchParams.get("destination")).toBe("12,77");
});
it("exports a timezone-correct arrival reminder without exposing participant locations", () => {
  const room = { code: "ABCDEF12", version: 4, settings: { target_arrival: "2030-01-01T17:30:00+05:30" } } as Room;
  const calendar = meetupCalendar(room, venue, "https://example.com/room/ABCDEF12", new Date("2029-01-01T00:00:00Z"));
  expect(calendar).toContain("DTSTART:20300101T120000Z\r\n");
  expect(calendar).toContain("SUMMARY:Meetup at Café\\, friends\\;\\nBEGIN:VEVENT");
  expect(calendar.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
  expect(calendar).not.toContain("DTEND");
  for (const line of calendar.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
});
it("rejects corrupt saved identities", () => {
  for (const value of ["null", "{}", "[]", '"token"', '{"token":3,"participant_id":"p"}', "invalid"]) expect(parseSession(value)).toBeNull();
});
