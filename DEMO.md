# Repeatable demo (about five minutes)

## Before presenting

- Run all automated checks. Confirm `/health` reports `routing_configured: true`.
- Start frontend/backend with the documented key and origins. Use HTTPS for actual device location.
- Choose a dense neighborhood you know (default map: central Bengaluru). Verify Overpass returns venues and ORS supports paths there. Do not depend on untested remote addresses.
- Keep strict metadata verification off: most venues have unknown price/capacity/hours. Confirm opening details yourself if planning a real outing.
- Use three different browsers/phones or isolated profiles. Use “Leave meetup” before departing; closing a tab alone does not remove its voting requirement.

## Live demonstration

1. Create a room as Alex. Open “Add my starting point,” click a map location, pick walking, and save.
2. Copy the room link to Sam and Jo. Each joins, chooses a different nearby starting point and walking/cycling/driving, and saves. Observe names and markers updating in every browser.
3. Host: choose target arrival 90–120 minutes ahead in settings. Keep fairness weight at zero. Click “Find meeting points.” Explain that venues are real OSM records and timings are ORS network routes.
4. Show the recommendation, longest individual journey, total/average, minimax ranking and each departure. Expand venue details to show unknown metadata rather than fictional prices.
5. Change fairness weight to 0.5. Show both rankings and explain that a smaller journey gap may cost a longer worst journey. Revert to zero if desired. Any proposed switch needs group confirmation.
6. Move one participant's delay slider slightly. Every browser updates; small changes keep the selected venue. Increase the delay until the chosen schedule becomes infeasible. If another venue remains feasible, a proposal appears; approve in all browser sessions to switch. If every venue is infeasible, move the target arrival later to restore a feasible plan.
7. Refresh one guest page. Their identity, current selection and delay recover. Temporarily disable network and restore it to check reconnection.
8. On a phone, inspect the map, journeys and comparison table. Use horizontal scrolling within the table. Test keyboard focus, Escape to close dialogs and visible errors.

A venue switch cannot be promised for every set of live routes. In rehearsal choose a participant whose selected-venue route is materially longer than their route to an alternative; place target arrival so the alternative can still fit when their readiness shifts. Report the actual result. Do not pass synthetic timings off as live routing.

## Without an API key or during a provider outage

Demonstrate room creation/join, map clicks and synchronized delay values. Click calculate to show the honest provider/configuration error. For deterministic algorithm evidence, run:

```bash
cd backend
.venv/bin/python -m pytest tests/test_core.py tests/test_api.py -v
```

For a fully automated UI demonstration with clearly **synthetic test fixtures**, run frontend `npm run test:e2e -- --headed` after installing Chromium. That test-only server is separate from production; it verifies two-session scheduling and confirmation, not live venue/route data.

## Manual acceptance checklist (requires real credentials/network)

- [ ] Create and join from two actual devices over LAN or deployed HTTPS.
- [ ] Search a real address and select a result; device permission accepted/denied paths work.
- [ ] Actual OSM tiles render, pan and zoom; attribution is visible.
- [ ] Discover real venues and inspect metadata against OSM.
- [ ] ORS returns actual routes for walking, cycling and driving; record provider timestamp.
- [ ] Real recommendation and schedule match visible inputs.
- [ ] Small delay retains the venue; large delay changes feasibility and synchronizes.
- [ ] Proposal confirmation works for every participant.
- [ ] Deployed WSS reconnects; refresh restores room state.

See the implementation plan's execution record for checks that have actually run. This checklist is deliberately unmarked until those live steps are executed.
