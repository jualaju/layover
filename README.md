# Rendezvous

A real-time meeting-point optimizer for small groups. Each person chooses a starting point and walking, cycling, or driving. The server discovers up to ten real OSM cafés/restaurants, requests real OpenRouteService durations, and recommends the venue with the shortest longest journey. Shared rooms synchronize through authenticated WebSockets.

The application contains no fake routing fallback. Without an ORS key, rooms, map clicks, device location and live delay updates work; routing reports that configuration is missing; submitted place searches use Nominatim without an ORS key. Synthetic data is confined to automated tests.

After choosing a venue, **Open my directions** opens Google Maps with your starting point and travel mode. **Add to calendar** downloads a timezone-aware arrival reminder for an eligible selection. Calendar files are snapshots, not live subscriptions; export again after changing the plan. Directions are calculated by Google Maps independently of the ORS estimates.

The interface uses an 8-bit overworld theme with original SVG island artwork, pixel character/café/star map markers, and a locally hosted Pixelify Sans font. The font's SIL Open Font License is included in `frontend/public/fonts/OFL.txt`; no runtime font service is required. The landing illustration is decorative; room maps continue to use real OpenStreetMap geography.

## Run locally

Requirements: **Node 22.14+ (22.x)**, npm, Python 3.12 with venv. The original Node 18/Next 14 starter was upgraded because dependency auditing found known security issues. No system runtime was overwritten.

Backend, from the repository root:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip==26.2.1
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
# Edit .env: add ORS_API_KEY. Never share or commit that file.
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --ws-max-size 16384
```

Frontend, in another terminal:

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev -- --hostname 0.0.0.0
```

Open http://localhost:3000. Backend health: http://localhost:8000/health. Interactive API reference: http://localhost:8000/docs. Press Ctrl+C to stop either server.

### Optional account login

The header supports email/password accounts stored in SQLite by the backend. Passwords are stored as salted PBKDF2 hashes, and login sessions use an HttpOnly cookie. The default database is `backend/data/rendezvous.sqlite3`; Docker Compose stores it in the `auth_data` volume. Room links and room access remain independent of account login.

Supabase accounts are not migrated because their passwords are not available to the app. Existing users should create a new local account. For a hosted deployment, mount persistent storage at the configured `AUTH_DB_PATH` or accounts will be lost when the service is replaced. If frontend and API are on different sites, configure `AUTH_COOKIE_SECURE=true` and `AUTH_COOKIE_SAMESITE=none` over HTTPS.

For other devices on a local network, add the frontend's LAN origin (for example `http://192.168.1.113:3000`) to `ALLOWED_ORIGINS` in `backend/.env` and restart the backend.

For the current workspace only, a temporary Node 22 binary was downloaded under `/tmp/rendezvous-tools/node_modules/node/bin`. If your shell still uses Node 18, prefix frontend commands with `PATH=/tmp/rendezvous-tools/node_modules/node/bin:$PATH`. This temporary path is not a deployment dependency; use a normal Node 22 installation elsewhere.

## Credentials and provider limits

Register at [HeiGIT / OpenRouteService](https://account.heigit.org/), activate an API key, review the account's [plan](https://account.heigit.org/info/plans) and [terms](https://account.heigit.org/info/tos), and set **only** `backend/.env: ORS_API_KEY`. Plan pages are dynamic and account quotas must be confirmed in your dashboard; no daily quota is assumed here. ORS [matrix restrictions](https://openrouteservice.org/restrictions/) list 3,500 origin × destination pairs for ordinary matrices. Our maximum is 8 × 10, split into one request per used transport mode.

Nominatim powers explicitly submitted place search (no autocomplete). Configure `NOMINATIM_URL` to switch to another compatible service. Overpass supplies named venues within 4 km of the group center (up to 100 returned records, nearest ten retained); it is a finite search, not a global optimum guarantee. Requests use timeouts, a descriptive User-Agent, caching (routes 5 minutes, venues 30 minutes, searches 1 hour), and serialized calls at least two seconds apart. Public Overpass is best-effort and can return 429/timeout errors. The provider endpoints and tile URL are configurable.

The map uses [OSM standard tiles](https://operations.osmfoundation.org/policies/tiles/), with visible attribution, browser caching and referrer, and no bulk download/prefetch. OSM data is [ODbL](https://www.openstreetmap.org/copyright). The existing Nominatim integration uses a shared backend throttle and one-hour cache. Its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) limits the entire application to at most one request per second, requires attribution and identification, forbids autocomplete, and requires the operator to take responsibility for public-service use. Keep a single backend process; use an appropriate hosted or self-hosted service for larger deployments. A hosted demo must have an identifying contact in `PROVIDER_USER_AGENT` and remain within each provider's terms.

## Architecture you can follow

| Area | Files | Responsibility |
| --- | --- | --- |
| Landing / shared room | `frontend/app`, `frontend/components` | Forms, map, recommendation, comparison and journeys |
| Browser networking | `frontend/lib/api.ts`, `use-room.ts`, `types.ts` | HTTP, session identity, WebSocket reconnect and typed events |
| API | `backend/app/main.py`, `models.py` | Validated requests, authorization and client events |
| Room state | `backend/app/store.py`, `service.py` | Isolation, locks, snapshots and recalculation |
| External data | `backend/app/providers.py`, `config.py` | Search, discovery, routing, caching and failures |
| Math | `backend/app/optimization.py`, `scheduling.py` | Pure functions, no browser or external API required |

A **travel-time matrix** is a table: participant rows, venue columns. ORS returns seconds; the backend converts them to minutes, preserves null routes and groups requests by mode. A null route excludes that venue for the group, rather than assigning an invented journey.

**Minimax** sorts eligible venues by longest journey, then total journey, then stable venue ID. Optional fairness uses `score = longest + weight × (longest − shortest)`. Both baseline and adjusted ranks are shown. Adjusted scoring can increase the absolute longest journey. Historical fairness is deferred until persistent identities and history exist.

**Eligibility** filters known price, group capacity, closure, maximum journey and target-time feasibility. Missing metadata stays unknown. Strict metadata verification excludes unknowns. Only literal OSM `24/7` is recognized as known open; other hours are displayed for manual verification. Prices are generally unknown in OSM and are never inferred from venue names. Price levels are ordinal preferences, not amounts in a currency. Availability means the latest acceptable arrival, not meeting end time.

**Scheduling** uses `departure = target − journey − safety buffer`. Earliest readiness is `max(current time, ready_at + simulated delay)`. If readiness is after departure or target is outside availability, the schedule is infeasible. Computed timestamps are timezone-aware; the UI displays device-local times and dates. A delay shifts readiness, not route duration. Delays reuse existing routing results without spending provider quota.

**WebSockets** distribute full versioned room snapshots. Browser credentials go in the first auth message rather than URLs. Events: `participant.update`, `delay.update`, `venue.vote`; server events: `room.state`, `participant.updated`, `delay.updated`, `recommendation.updated`, `error`. Payloads are validated. Reconnection uses exponential backoff and a fresh snapshot. HTTP uses per-participant bearer tokens; only the host changes settings or discovers/refreshes routes. Location or mode changes automatically refresh an existing matrix when all locations are present; otherwise the room visibly becomes stale.

**Hysteresis** retains the current venue unless score improvement exceeds `max(absolute threshold, relative threshold × current score)`. Defaults: 3 minutes and 10%. An unavailable/infeasible current venue bypasses that threshold. A switch still needs every current participant's approval; a rejection keeps the current venue. Input changes discard old votes, and final approval rechecks feasibility. An initial recommendation needs no vote. No eligible candidates produces an explicit message and retains any existing selection with an infeasibility warning.

## Checks

```bash
cd backend
.venv/bin/python -m pytest -q
```

```bash
cd frontend
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

Backend and component tests mock external responses. Browser tests start a separate, explicitly test-only API (`tests.browser_server`) and two isolated browser contexts; map tile requests are blocked in those tests. They do not validate live provider data. Production cannot enable synthetic routes through an environment flag. See `DEMO.md` for live manual checks and `IMPLEMENTATION_PLAN.md` for the executed validation record. To explicitly smoke-test real discovery/routing, run `backend/.venv/bin/python backend/scripts/live_smoke.py` from the root after configuring environment variables (or run `.venv/bin/python scripts/live_smoke.py` from `backend` to load its `.env`). This makes external requests and is never part of automated tests.

## Two phones / local network

1. Put both phones on the same Wi-Fi as the computer.
2. Replace the frontend API URL with `http://YOUR_COMPUTER_LAN_IP:8000`; restart Next.js.
3. Add `http://YOUR_COMPUTER_LAN_IP:3000` to backend `ALLOWED_ORIGINS`; restart FastAPI.
4. Visit `http://YOUR_COMPUTER_LAN_IP:3000`, create a room and share its URL. Open it from the other phone.
5. Browser geolocation generally needs HTTPS or localhost. On plain LAN HTTP, use map pins or search.

## Deployment preparation

Recommended: Next.js on Vercel and a single long-lived FastAPI instance on Render (or any host supporting WebSocket upgrades). [Render supports WebSockets](https://render.com/docs/websocket) and [Vercel supports Node 22](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Sites Worker hosting does not run this Python backend. Choose Node 22 for the frontend, repository root directory `frontend`, build `npm run build`; configure `NEXT_PUBLIC_BACKEND_API_URL` to the backend HTTPS URL **before** building. For the backend use the Dockerfile / `render.yaml`, set ORS key, exact frontend origins, and provider contact. Keep exactly one backend worker/replica; use a persistent instance for a demo and check host sleep limits in your account.

Use HTTPS/WSS, test browser WebSocket upgrades, and run the complete real-provider demo before presenting. Configuration files are prepared; no cloud deployment or account resources have been created. The Dockerfiles run as non-root. For local containers, copy `backend/.env.example` to `backend/.env`, configure it, then run `docker compose up --build`. Docker execution is a separate validation step.

## Prototype limits

Rooms expire 24 hours after creation, cap at eight people, and live only in one process. Restart/redeploy loses state. Room state has no database or Redis persistence; optional accounts use SQLite. No transit, live traffic, history, full opening-hours parser, meeting-duration constraint or background traffic refresh. Route/schedule validity is refreshed by actions, not a continuous clock feed. Public providers and OSM metadata have incomplete coverage. A selected venue is not a reservation.

Anyone with a room code can join and see shared locations. Tokens are held in browser session storage and survive refresh in that tab; clearing storage loses the identity. Use **Leave meetup** to revoke your room token and remove your location and votes. Hosting passes to the next participant; empty rooms are deleted. Closing a tab alone does not leave the room. An invitation link is not a private account system. Request/event limits and room TTL bound a hackathon prototype, but public deployment needs gateway request-body limits, abuse protection, durable persistence, token lifecycle and monitoring. Add PostgreSQL and shared broadcast before multiple workers.


Browser tests can use separate ports when local servers are already running:

```bash
cd frontend
TEST_API_PORT=8001 TEST_WEB_PORT=3001 npm run test:e2e
```
