# Last 100 m — One Street, Four Realities

Standalone Vite project converted from the supplied single-file HTML prototype. Satellite imagery uses Esri World Imagery, and the browser asks for location access so it can center the map on you. If you deny access, the app shows a labeled Bengaluru demo area instead. The dashboard works without an AI key; the optional Access Copilot needs an OpenRouter API key on the local server.

## Run it

Requires Node.js 20 or newer. To use the optional AI copilot, first copy `.env.example` to `.env` and add your OpenRouter API key, then run:

```bash
cd /Users/nookaharshavardhan/Documents/Codex/Last-100-Metres
cp -n .env.example .env
npm install
npm run dev
```

Open the local address printed by Vite. Location access works on `localhost` or HTTPS. Esri receives satellite tile requests for the area visible in the map. To build the frontend, run `npm run build`; `npm run preview` also serves the local AI endpoint through the Vite server plugin.

### Enable the AI Access Copilot

1. Copy `.env.example` to `.env` in the project root.
2. Set `OPENROUTER_API_KEY` to your OpenRouter key. You can change `OPENROUTER_MODEL` to a model available to your account.
3. Restart `npm run dev`, click the floating **Access AI** chat bubble, and ask a question about the current board.

The API key stays in the local server environment and `.env` is ignored by Git. Never paste the key into browser code or commit it. API usage may incur charges. The copilot sends OpenRouter your question and a limited summary of open issue categories, scores, report counts, days open, and the selected persona; the selected model provider may also receive this request. Exact coordinates, route endpoints, photos, and completion history are excluded. AI responses are advisory and do not change official scores or mark tasks complete. The local dev and preview servers listen on this Mac only. A public/static hosting service needs its own secure server-side `/api/ai` endpoint; do not expose the key in the frontend bundle.

## Features

- Esri satellite map centered on your browser location, with a Bengaluru demo fallback, selectable issue pins, and visible latitude/longitude. Nearby schools are first looked up from OpenStreetMap after location access is granted.
- Four accessibility personas plus an everyone view; scores and rankings respond to the selected person.
- Plain-language Top 10 queue and a breakdown of impact, nearby footfall, confirmations, and time unresolved.
- Report categories, map pin, photo attachment, multilingual text classification, and optional browser speech recognition in English, Hindi, and Kannada.
- Nearby duplicate detection and merging.
- Nearby school choices use real OpenStreetMap names and coordinates. If the nearby-data lookup is unavailable, use **Search nearby schools in OpenStreetMap** in the Route panel. This sends one bounded search only after you click; it returns best matches and may omit schools. Government and primary labels appear only when the mapped school name or tags support that classification.
- Pedestrian routing works between any two map points or searched addresses, as well as nearby schools. Set either endpoint by clicking the map or search a place/address; selected endpoint coordinates are shown. Routes follow mapped streets through the public Valhalla demo service, with a wheelchair profile for wheelchair users, a blind profile for visually impaired users, estimated distance/time, turn-by-turn directions, and nearby prototype issue pins.
- Completed issue fixes appear in a History tab and persist in browser local storage on the same device.
- An AI Access Copilot can explain the live issue board and suggest practical next steps for the selected persona. It uses an optional server-side OpenRouter key, never affects priority scores, and excludes exact map coordinates, route endpoints, photos, and completion history from its context.
- A rupee-denominated repair budget planner ranked by priority per rupee, including a comparison of remaining barrier load for all four personas.
- Confirm a repair, attach an after photo, view a before/after comparison, and print a ward brief.
- Responsive layout, system dark mode, keyboard focus styles, and reduced-motion support.

## Source structure

```text
Last-100-Metres/
├── index.html
├── package.json
├── README.md
├── PROJECT_HANDOFF.md
├── vite.config.js   # Local and preview-only secure OpenRouter API proxy
├── .env.example     # AI configuration template; copy to ignored .env
└── src/
    ├── main.js        # App state, UI rendering, and interactions
    ├── styles.css     # Layout, theme, and responsive styles
    ├── data.js        # Personas, issue seeds, fallback demo landmarks, and repair costs
    ├── scoring.js     # Priority scoring and explanations
    └── reporting.js   # English, Hindi, and Kannada issue suggestions
```

The AI proxy uses Vite middleware in local development and Vite preview. A deployment to a static-only host needs an equivalent server-side function for `/api/ai` and a secret environment variable configured in the hosting platform.

The score and sample issue pins are explainable demo data; searched destinations, school matches, and route geometry use public map services when available. New reports and photo previews stay in browser memory and reset when the page is refreshed; completed task history persists locally in the browser. Place search and routing need internet access and depend on public OpenStreetMap services and their usage limits. Nominatim returns best matches and may omit places. Street routing is an estimate and does not include live traffic. Speech recognition depends on browser support and microphone permission.
