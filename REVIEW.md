# Project review — 2026-10-11

This pass reviewed the application flows, room state and authorization, provider integration, optimization and scheduling, frontend forms and connection handling, deployment configuration, and existing tests. Pre-existing account/storage and container changes were preserved. This is a targeted reliability and usability improvement, not a claim that every possible defect has been eliminated.

## Changes

- Participants can explicitly leave. The API revokes their room tokens, closes their sockets, removes their locations/preferences, transfers hosting to the next participant, and deletes empty rooms. Remaining participants are rescored using existing routes without provider calls.
- Rediscovery retains the agreed venue among at most ten candidates until a switch is approved. Loading clears old rankings and proposals; failed or invalidated routes clear their retrieval timestamp. The UI explicitly labels retained selections whose estimates are unavailable.
- Periodic room expiry closes idle connections instead of waiting for another incoming request.
- HTTP limits count actual streamed bytes, including bodies without Content-Length. Cookie account mutations reject untrusted origins. Auth throttling runs on the event loop, and expired throttle entries are cleaned up.
- Saved identities are shape-checked; disconnected socket callbacks cannot overwrite a subsequent room's state. Room validation errors identify the relevant field. Account refresh responses cannot overwrite a newer sign-in/sign-out operation.
- Existing Nominatim search now has a configurable endpoint, visible attribution, matching tests/docs, and bounded labels. Malformed optional discovery tags no longer crash route discovery.
- Selected venues have personal directions links and an iCalendar arrival reminder. Calendar text is escaped and folded by UTF-8 byte length; export includes the room URL and venue, not other participants' locations. Exported reminders do not update automatically and do not invent a meeting duration.
- Browser tests accept separate API/frontend ports, allowing validation alongside running local services.

## Verification

- Backend: 38 tests passed, including account lifecycle, token revocation, host transfer, streamed body limits, rediscovery, and provider parsing/cache behavior.
- Frontend: 13 component/helper/connection tests passed.
- ESLint and TypeScript checks passed.
- Chromium: two browser tests passed, including two participants, mobile layout, unanimous switching, reload recovery, directions, calendar download, leaving, and host handover.
- Production build passed.
- Git whitespace validation passed.

The backend emits a TestClient/httpx deprecation warning; Vitest emits a future configuration-loader warning. Neither caused test failures. Live provider calls, Docker builds, dependency vulnerability audits, and cloud deployments were not run in this pass.

## Remaining boundaries

Rooms still require one backend process and disappear on restart. Account persistence requires a durable SQLite volume. Closing a tab does not remove a participant; use the leave action. Schedule feasibility refreshes on room actions, not continuously. Public provider coverage, incomplete venue metadata, and unverified opening hours remain explicit limitations.

References used for the additions: [Google Maps URL parameters](https://developers.google.com/maps/documentation/urls/get-started), [iCalendar specification](https://www.rfc-editor.org/rfc/rfc5545), and [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). Nominatim must remain explicitly submitted search, with application-wide throttling, identification, attribution, and caching; operators are responsible for compliance or choosing another endpoint.
