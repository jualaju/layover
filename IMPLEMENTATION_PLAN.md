# Rendezvous implementation plan

The existing Next.js landing page and FastAPI health endpoint are the starting point. No existing commits or application functionality beyond those were found. Python 3.12 and Node 18.19 are installed; dependency directories already exist. No applicable AGENTS.md was found. Preserve the App Router / FastAPI stack and existing checkout.

## Essential MVP milestones

- [x] M0 — Inspect and plan. Goal: inventory the checkout and verify provider policies before application edits. Files: this plan, DECISIONS.md. Dependencies: filesystem, Git, provider documentation. Acceptance: prerequisites and honest verification boundaries recorded. Validation: `git status --short`, runtime version checks, read existing files and official provider docs.
- [x] M1 — Runnable foundation. Goal: configured frontend/backend with reproducible dependencies. Files: package manifests, configuration, environment examples, health endpoint. Dependencies: Node/npm, Python venv, package downloads. Acceptance: backend starts, frontend serves, lint/typecheck/build pass. Validation: `cd backend && .venv/bin/python -m pytest`; `cd frontend && npm run lint && npm run typecheck && npm run build`.
- [x] M2 — Landing and participant setup. Goal: polished responsive creation/join/setup forms with errors. Files: frontend/app, components, lib. Dependencies: M1. Acceptance: accessible named inputs, mobile layout, persisted session identity, real API calls. Validation: frontend component tests, lint/typecheck; manual keyboard and narrow viewport checks.
- [x] M3 — Authorized rooms. Goal: create/join/update isolated rooms. Files: backend models/store/main, frontend API. Dependencies: M1. Acceptance: random room codes and per-participant tokens, validated input, host-only settings, bounded rooms. Validation: pytest API tests for creation, join, invalid input, isolation, authorization.
- [ ] M4 — Locations and venues. Goal: map click/device location/explicit search plus approximately ten real OSM venues. Files: map/setup components, places integration. Dependencies: M2/M3; ORS key for search, Overpass access for venues. Acceptance: attributed interactive map, bounded cached discovery, missing metadata shown as unknown. Validation: mocked search/discovery tests; manual real map/discovery smoke test when network allows.
- [ ] M5 — Real routing matrix. Goal: backend-only ORS walking/cycling/driving durations. Files: providers/routing, room orchestration. Dependencies: M3/M4; ORS_API_KEY. Acceptance: one matrix request per mode, null-route handling, cache, timeout/quota errors; never fabricated results. Validation: mocked httpx tests of request indices, seconds conversion, parsing, failures, mixed modes; live smoke only with key.
- [x] M6 — Optimization and scheduling. Goal: independently testable minimax, optional fairness, eligibility and departures. Files: optimizer/scheduler modules. Dependencies: typed participants/venues/matrix. Acceptance: deterministic ties; distinguish baseline and adjusted order; filter known constraints; unknowns explicit; readiness/buffer/availability respected and infeasibility visible. Validation: pytest pure tests for ties, fairness, unknown constraints, no-route, deadlines and infeasible schedules.
- [x] M7 — Real-time disruptions and confirmation. Goal: synchronized state, simulated delays, hysteresis and group voting. Files: WebSocket manager/events/service, frontend connection hook. Dependencies: M3/M5/M6. Acceptance: token authentication, origin validation, room isolation, reconnect/state refresh, serialized changes, threshold-gated proposal and unanimous confirmation; delays reuse routes and recompute schedule. Validation: pytest WebSocket tests with two clients, bad events, delay, proposal/votes; browser sessions when available.
- [x] M8 — Integrated meeting room. Goal: map-focused recommendations, comparisons, journey breakdown and controls. Files: room page/components. Dependencies: M2–M7. Acceptance: loading/empty/error/reconnect states, shareable URL, host controls, delay and proposal explanations; no example estimates presented as real. Validation: frontend tests/build, end-to-end mocked browser flow if browser tooling available, manual two-session walkthrough.
- [x] M9 — Delivery preparation (live acceptance remains open in M4/M5). Goal: deployment preparation and convincing repeatable demo. Files: README, DEMO.md, deployment files, CI, final checklist. Dependencies: M1–M8. Acceptance: automated checks pass; setup/env/security/storage limitations documented; exact live demo and offline test alternatives; remaining credential/browser/deployment gaps marked explicitly. Validation: full backend suite, frontend tests/lint/typecheck/build, health/server smoke, secret exclusion checks, provider/live checks where available.

## Optional improvements (after MVP)

- [ ] PostgreSQL room persistence and Redis broadcast before multiple server workers.
- [ ] Historical fairness ledger tied to durable identities; do not infer history for anonymous users.
- [ ] Public transit with a verified provider and local transit data.
- [ ] Comprehensive OSM opening_hours parsing with venue timezone and holiday support.
- [ ] Route geometry, traffic integration, account login, moderation, stronger rate limits and observability.

## External prerequisites / verification boundaries

- ORS_API_KEY is needed for actual routing and ORS/Pelias place search. No key has been supplied. Implement and verify mocked integration; live results remain unverified until configured.
- Overpass and OSM raster tiles need network access and are best-effort public services. Use bounded discovery and cache; display OSM attribution and never prefetch tiles.
- Use one backend worker with in-memory state. Server restarts lose rooms; deployment must avoid horizontal scaling until shared persistence/broadcast is added.
- No browser automation tool is currently exposed. Investigate local tooling before claiming browser verification.
- Node 22.14+ is now required. Upgraded to Next 16.4 / React 19 / Tailwind 4; a temporary Node 22 runtime in /tmp was used without changing system Node. Webpack and TypeScript compiler API are used because restricted Turbopack workers could not bind local IPC ports.

## Progress / executed validation

Initial inspection completed before application edits. Checkboxes represent acceptance actually met; provider/browser-dependent requirements stay open when unverified.


### Verified implementation so far

- Backend 32 tests passed on patched FastAPI 0.143 / Starlette 1.7 / Pydantic 2.14, including two simultaneous WebSocket clients, stale votes, rejection, confirmation, reconnection, input/auth/origin checks, room expiry/isolation, mixed-mode matrix parsing, caches/failures and optimizer/scheduler cases. One upstream TestClient warning recommends httpx2; HTTP/routing integration uses the requested httpx and all tests still pass.
- Frontend 4 component/networking tests passed on React 19 / Vitest 5. Lint and TypeScript passed. `npm run build` passed using Webpack + compiler API after two restricted Turbopack/CLI build attempts failed.
- Real backend health and built frontend landing/dynamic room HTTP checks passed (200). `/health` confirms routing credentials absent.
- `npm audit`: zero vulnerabilities after replacing the lint preset's unpatched glob dependency with direct TypeScript/React Hooks checks. `pip_audit`: no known vulnerabilities after upgrading older vulnerable packages. Actual .env files and dependencies are ignored by Git.
- M5 is integration-complete and mocked-response verified; **live ORS routing/search remain unverified, key missing**. No synthetic routes are exposed by production.
- Live venue discovery attempted once at overpass-api.de (504) and once at the documented private.coffee alternative (500). No successful real venue discovery is claimed. Tests verify safe failures and metadata parsing. M4 remains open pending real map/provider checks.
- Docker image builds and Chromium download/browser E2E are underway. M2/M8/M9 remain open pending those results. Cloud publication is not part of this local execution.

### Browser verification completed

- Headless Chrome 141 from Google's official Chrome for Testing distribution ran Playwright against the frontend and explicit synthetic-fixture API. Both browser tests passed: desktop host + 390px guest create/join, interactive map click, participant updates, live delay, proposal, unanimous confirmation, refresh recovery, no JavaScript errors and no horizontal page overflow. Mobile landing + dialog Escape also passed.
- The first browser run caught cold navigation timing; added a room loading boundary. The second caught Leaflet zoom callbacks after modal unmount; disabled map animations and the next run passed. Neither failure was hidden or skipped.
- Frontend now has six passing component/connection tests, including snapshot ordering, room message isolation and disconnected writes. Desktop/mobile landing screenshots were captured and inspected.
- M2/M8 UI acceptance is met with an explicitly labeled test fixture; live provider acceptance remains separate in M4/M5. M5 implementation and mocked response tests are complete, but its checkbox remains open until actual ORS routing/search is exercised with a real key.
- Both initial Docker images built and served HTTP successfully; Compose config validated without reading real secrets. Final images are rebuilding after browser fixes. No cloud deployment has occurred.

- Live OSM map smoke passed: 15 successful actual tile responses, zero failed responses, attribution visible and no mobile page overflow. Shared-room screenshots captured and inspected. M4 location/map implementation is verified; real venue discovery remains blocked by the observed provider failures. No ORS credentials are available.


## Final execution record

| Check | Result |
| --- | --- |
| Backend pytest | **32 passed**, one upstream httpx/TestClient deprecation warning |
| Python compileall / pip check | Passed; no broken dependency requirements |
| Frontend lint / TypeScript | Passed |
| Frontend Vitest | **7 passed** (forms, auth header, identity, snapshots, room isolation) |
| Frontend production build | Passed, Next 16.4 with Webpack / TypeScript compiler API |
| Playwright | **2 passed**, desktop host + mobile guest, map clicks, delay, voting, refresh and keyboard modal; synthetic provider API clearly labeled |
| Real OSM map check | **15 successful actual tile responses**, zero failures; attribution visible, no mobile overflow |
| npm audit, full and production-only | Zero vulnerabilities reported |
| pip_audit of installed Python packages | No known vulnerabilities reported |
| Docker backend/frontend builds | Both final images built; backend pip tooling also upgraded to audited 26.2.1 |
| Packaged HTTP smoke / Compose config | Backend health and frontend page passed; Compose validated without resolving secrets |
| Live venue discovery | **Failed**: primary 504, alternative 500, corrected-output primary recheck 504; no successful live venue retrieval claimed |
| Live ORS routing and place search | **Not run**: ORS_API_KEY unavailable; request/response integration verified with mocks |
| Actual two phones / hosted HTTPS/WSS | **Not run**; separate browser contexts at desktop/mobile sizes tested locally |
| Cloud deployment / CI run on GitHub | **Not run**; configuration files prepared, equivalent local checks executed |
| Git exclusions and whitespace | Passed; secrets, generated dependencies and test artifacts excluded; changes were uncommitted at implementation handoff |

Frontend AGENTS.md was generated by the upgraded Next development server after initial inspection; its relevant local Next guides were consulted. No pre-existing source was discarded. Browser QA found and fixed the dynamic-route loading and Leaflet-unmount issues. Final room-isolation regression verifies switching from a room with a higher version to a new room with a lower version. Venue discovery explicitly requests body coordinates; tag-only output would omit node positions.

All application slices and deployment preparation are implemented and tested within the available environment. **Do not call the application fully hackathon-ready until M4/M5 live provider acceptance and the manual real-device checklist in DEMO.md pass.** Configure the backend key, retry the bounded discovery smoke check with a healthy authorized endpoint, then rehearse the actual-data flow. Optional persistence/transit/history remain intentionally deferred.

Owned preview/test servers and smoke containers are stopped at handoff. Temporary Node/Chrome downloads are in /tmp; local Docker images are available for subsequent deployment checks. Production does not use the fixture server.
