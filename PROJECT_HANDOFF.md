# Last 100 m — Project Handoff

**Updated:** 31 October 2026
**Local project:** `/Users/nookaharshavardhan/Documents/Codex/Last-100-Metres`  
**GitHub repository:** <https://github.com/Harshanie-2025/common-ground-accessibility>  
**Branch:** `main`

## Project purpose

An accessibility-first civic dashboard for reporting street barriers and choosing repairs that help wheelchair users, older adults, people with visual impairments, and parents with strollers. It is a frontend prototype with seeded demo issues, no app database or user accounts, and an optional local Vite middleware endpoint for AI.

## Implemented

- Responsive satellite-map dashboard with browser geolocation, latitude/longitude readout, issue pins, report form, photo preview, duplicate merging, issue scoring, persona switching, Top 10 ranking, and a budget planner.
- Nearby schools are discovered from OpenStreetMap when location is available. If the automatic nearby-data lookup fails, the Route panel offers a user-triggered Nominatim school search. The school search is bounded and may return incomplete matches.
- Added a separately toggled real-world OpenStreetMap context layer, loaded after browser location is granted. It shows mapped schools/public destinations and transit within 3 km, plus crossings, steps, kerbs, and wheelchair-access tags within 1.5 km. Its search center is rounded to about 100 m. These are map features, not verified citizen reports, and they do not enter the demo issue rankings.
- Routing is no longer school-only. Users can:
  - choose **Set start on map** or **Set destination on map**, then tap a point on the map;
  - search any address or place and use a result as the route start or destination;
  - use the current location and nearby schools through the same endpoint selectors.
- Route endpoints show their coordinates. A public Valhalla service returns pedestrian route geometry, distance, ETA, and turn-by-turn steps. Wheelchair and visually impaired profiles pass different pedestrian settings. Prototype issue pins near the route are flagged separately.
- A **History** tab lists issues marked fixed. It saves task ID, type, completion time, coordinates, and whether an after photo was attached in browser `localStorage`; the list survives refreshes on the same browser/device. New reports and actual photo data are still session-only.
- A notification bell opens a dropdown with an unread count. It records new reports, duplicate merges, confirmations, and fixes. Up to 50 recent notifications are stored in browser `localStorage`; they are not synced across users or devices.
- This project is kept as one root with a single `src/` directory. No second `src` folder is needed.
- Added a floating **Access AI** chat bubble at the bottom-right, backed by OpenRouter's OpenAI-compatible Chat Completions API through a Vite server-side proxy. Default model: `openai/gpt-4o-mini`; change it with `OPENROUTER_MODEL`. It can explain the current issue ranking and offer ward-planning suggestions for the selected persona. It cannot change scores, reports, routes, or completion history.
- AI setup: copy `.env.example` to `.env`, set `OPENROUTER_API_KEY`, optionally set `OPENROUTER_MODEL`, then restart `npm run dev`. The key is read only by the server and `.env` is ignored by Git. Without a key, the rest of the app continues to work and the AI panel shows setup instructions.
- The AI request contains the user's question and a filtered board summary: selected persona, aggregate open/completed/urgent counts, and up to 15 issue categories, scores, report counts, and days open. The server strips all other context fields. It does not send coordinates, photos, route endpoints, or completion history. OpenRouter and the selected model provider handle the submitted prompt under their own policies; browser chat is session-only.

## Run locally

Requires Node.js 20 or newer.

```bash
cd /Users/nookaharshavardhan/Documents/Codex/Last-100-Metres
npm install
npm run dev
```

Open the local URL printed by Vite. Location access requires `localhost` or HTTPS. To create a production bundle, run `npm run build`.

## Key files

- `index.html` — page structure and sidebar tabs, including Route and History.
- `src/main.js` — Leaflet map, browser state, location and school discovery, OSM context layer display, any-place routing, issue reporting, scoring display, and completed-task history.
- `src/local-context.js` — bounded Overpass lookup and classification of nearby OSM places/accessibility tags.
- `src/styles.css` — visual styling and responsive layouts.
- `src/data.js` — personas, seed issues, issue labels, and repair costs.
- `src/scoring.js` — persona-aware priority calculations and explanations.
- `src/reporting.js` — report text/category helpers.
- `README.md` — local setup and feature summary.
- `PROJECT_HANDOFF.md` — this continuation brief.

## State and service boundaries

- `routePins.from` and `routePins.to` hold custom endpoints selected from map taps or Nominatim search. The dropdowns also include current location and school destinations.
- Free-text place search is only sent after the user presses Search (or Enter); it requests up to five Nominatim matches and uses the current map bounds as a preference, not a geographic restriction. Nominatim returns best matches and may be incomplete. Nearby-school fallback is also user-triggered. The one-second request spacing is per browser tab; a multi-user launch needs shared caching/throttling or a suitable provider.
- Route paths depend on the public Valhalla demo server and mapped street data. A route may fail if a requested point cannot connect to its pedestrian graph or the service is unavailable. There is no live traffic or guaranteed wheelchair accessibility.
- Esri supplies satellite imagery. OpenStreetMap supplies school/place search matches and routing data. These external services need internet access and may impose limits or change availability.
- The OSM context layer is displayed as mapped information only; OSM coverage can be incomplete or stale. Steps, kerbs, crossings, and wheelchair tags need field verification and must not be presented as a complete accessibility audit.
- Completed history is local to one browser profile. It is not synced to GitHub, another device, or another user. The project has no server/database/authentication.
- The AI endpoint is a lightweight local prototype proxy in `vite.config.js`, with request-size and per-IP rate limits. The Vite dev and preview scripts bind to `127.0.0.1` so the AI key proxy is not exposed to other devices on the network. It does not provide production user authentication or distributed abuse controls. A static GitHub Pages deployment cannot execute it. A public deployment needs an equivalent serverless/server endpoint and its key stored in the host's secret settings.
- OpenRouter API usage may incur charges depending on the selected model. Do not commit `.env` or expose the API key to frontend code.

## Remaining stretch work

- Persist issue reports, photos, and confirmations in a backend; sync history across devices.
- Add an address autocomplete experience only with an appropriate provider and usage policy (do not turn the public Nominatim endpoint into autocomplete).
- Add alternate route choices and richer accessibility constraints after selecting a maintainable routing provider.
- Add a formal product test suite and browser-level route/history regression checks.
- Consider a hosted geocoding/routing service or self-hosted endpoints before a public launch with multiple users.

## External references

- [Nominatim Search API](https://nominatim.org/release-docs/latest/api/Search/)
- [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Valhalla project documentation](https://valhalla.github.io/valhalla/)
- [OpenRouter API quickstart and endpoint](https://openrouter.ai/developers)
- [OpenRouter chat completions API reference](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)

## Suggested continuation checks

1. Run `npm run build` and resolve any compile errors.
2. In the browser, open Route, set start and destination with map taps, and confirm coordinates and a route appear.
3. Search a full address, set it as each endpoint, and verify the two endpoints can be mixed with a map point or school.
4. Mark a seeded issue fixed, open History, refresh, and confirm the record remains. Test a new issue too; new reports themselves are intentionally not persisted yet.
5. Review `git status`, commit the changes, and push `main` to the repository above after verifying the intended account.
