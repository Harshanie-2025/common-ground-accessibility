# Last 100 m — One Street, Four Realities

Standalone Vite project converted from the supplied single-file HTML prototype. No backend or map key is required. Satellite imagery uses Esri World Imagery, and the browser asks for location access so it can center the map on you. If you deny access, the app shows a labeled Bengaluru demo area instead.

## Run it

Requires Node.js 20 or newer. In a terminal:

```bash
cd /Users/nookaharshavardhan/Documents/Codex/Last-100-Metres
npm install
npm run dev
```

Open the local address printed by Vite. Location access works on `localhost` or HTTPS. Esri receives satellite tile requests for the area visible in the map. To build a deployable version, run `npm run build`.

## Features

- Esri satellite map centered on your browser location, with a Bengaluru demo fallback, selectable issue pins, and visible latitude/longitude. Nearby schools are first looked up from OpenStreetMap after location access is granted.
- Four accessibility personas plus an everyone view; scores and rankings respond to the selected person.
- Plain-language Top 10 queue and a breakdown of impact, nearby footfall, confirmations, and time unresolved.
- Report categories, map pin, photo attachment, multilingual text classification, and optional browser speech recognition in English, Hindi, and Kannada.
- Nearby duplicate detection and merging.
- Nearby school choices use real OpenStreetMap names and coordinates. If the nearby-data lookup is unavailable, use **Search nearby schools in OpenStreetMap** in the Route panel. This sends one bounded search only after you click; it returns best matches and may omit schools. Government and primary labels appear only when the mapped school name or tags support that classification.
- Pedestrian routing works between any two map points or searched addresses, as well as nearby schools. Set either endpoint by clicking the map or search a place/address; selected endpoint coordinates are shown. Routes follow mapped streets through the public Valhalla demo service, with a wheelchair profile for wheelchair users, a blind profile for visually impaired users, estimated distance/time, turn-by-turn directions, and nearby prototype issue pins.
- Completed issue fixes appear in a History tab and persist in browser local storage on the same device.
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
└── src/
    ├── main.js        # App state, UI rendering, and interactions
    ├── styles.css     # Layout, theme, and responsive styles
    ├── data.js        # Personas, issue seeds, fallback demo landmarks, and repair costs
    ├── scoring.js     # Priority scoring and explanations
    └── reporting.js   # English, Hindi, and Kannada issue suggestions
```

The score and sample issue pins are explainable demo data; searched destinations, school matches, and route geometry use public map services when available. New reports and photo previews stay in browser memory and reset when the page is refreshed; completed task history persists locally in the browser. Place search and routing need internet access and depend on public OpenStreetMap services and their usage limits. Nominatim returns best matches and may omit places. Street routing is an estimate and does not include live traffic. Speech recognition depends on browser support and microphone permission.
