# Common Ground — The Last 100 Metres

A clickable civic accessibility dashboard prototype for the hackathon problem statement **“The Last 100 Metres: One Street, Four Realities.”** The demo uses a locally drawn neighborhood map, so no map key or backend is needed.

## Run it

1. Install Node.js (20 or newer).
2. Open this folder in VS Code and open **Terminal → New Terminal**.
3. Run:

   ```bash
   npm install
   npm run dev
   ```

4. Open the local address printed by Vite (usually `http://localhost:5173`).

## Implemented in this prototype

- Responsive, map-first accessibility dashboard for a 2.4 km² study area.
- Twelve seeded street barriers with map pins, status, severity, reports, and persona impacts.
- Four persona switches (wheelchair user, older adult, low vision, parent with stroller) that immediately change issue priority scores and queue order.
- Report form with issue category, severity, affected personas, optional photo, description, and map pin placement. New reports appear immediately.
- Nearby duplicate detection for the same category; matching reports merge into the existing issue and increase its report count.
- Click an issue to see its explanation and confirm it; search and status filters update the map and queue.
- Top 10 fixes view with plain-language reasons and the transparent demo scoring formula.
- Responsive styling and reduced-motion support.

## Score model

The demo score is `severity (up to 45) + community reports (up to 24) + time unresolved (up to 17) + persona impact (8 or 30)`, capped at 99. It is an explainable hackathon heuristic, not a city policy or an official allocation decision.


