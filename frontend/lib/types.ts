export type Location = { lat: number; lng: number; label: string };
export type ParticipantInput = {
  name: string; location: Location | null; mode: "walking" | "cycling" | "driving";
  price_preference: number; ready_at: string; available_until: string | null;
  max_journey_minutes: number | null;
};
export type Participant = ParticipantInput & { id: string; delay_minutes: number };
export type Settings = {
  target_arrival: string; buffer_minutes: number; fairness_weight: number;
  switch_absolute_minutes: number; switch_relative: number; require_known_metadata: boolean;
};
export type Venue = { id: string; name: string; location: Location; category: string; price_level: number | null; capacity: number | null; opening_hours: string | null; known_open: boolean | null };
export type Journey = { participant_id: string; name: string; minutes: number; depart_at: string; ready_at: string; earliest_arrival: string; feasible: boolean; reasons: string[] };
export type Ranking = { venue: Venue; eligible: boolean; reasons: string[]; unknowns: string[]; journeys: Journey[]; worst_minutes: number | null; total_minutes: number | null; average_minutes: number | null; imbalance_minutes: number | null; fairness_penalty: number | null; score: number | null; baseline_rank: number | null; adjusted_rank: number | null; explanation: string };
export type Room = {
  code: string; host_id: string; version: number; settings: Settings; participants: Participant[];
  venues: Venue[]; rankings: Ranking[]; selected_id: string | null;
  proposal: { id: string; venue_id: string; reason: string; votes: string[] } | null;
  message: string; routing_status: "not_requested" | "stale" | "loading" | "ready" | "error"; routed_at: string | null; route_source: string | null;
};
export type Session = { participant_id: string; token: string };
export type Joined = Session & { room: Room };
export type ClientEvent = { type: "delay.update"; minutes: number } | { type: "participant.update"; participant: ParticipantInput } | { type: "venue.vote"; proposal_id: string; approve: boolean };
export type ServerEvent = { type: "room.state" | "participant.updated" | "delay.updated" | "recommendation.updated"; room: Room } | { type: "error"; message: string };
