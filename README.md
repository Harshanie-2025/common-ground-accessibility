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
- Pedestrian routing follows mapped streets through the public Valhalla demo service, with a wheelchair profile for wheelchair users, a blind profile for visually impaired users, estimated distance/time, and turn-by-turn directions. Prototype issue pins near the route are called out separately.
- A rupee-denominated repair budget planner ranked by priority per rupee, including a comparison of remaining barrier load for all four personas.
- Confirm a repair, attach an after photo, view a before/after comparison, and print a ward brief.
- Responsive layout, system dark mode, keyboard focus styles, and reduced-motion support.

## Source structure

```text
Last-100-Metres/
├── index.html
├── package.json
├── README.md
└── src/
    ├── main.js        # App state, UI rendering, and interactions
    ├── styles.css     # Layout, theme, and responsive styles
    ├── data.js        # Personas, issue seeds, fallback demo landmarks, and repair costs
    ├── scoring.js     # Priority scoring and explanations
    └── reporting.js   # English, Hindi, and Kannada issue suggestions
```

The score and sample issue pins are explainable demo data; the school destinations and route geometry are real map data when available. Reports and photo previews stay in browser memory and reset when the page is refreshed. School lookup and routing need internet access and depend on public OpenStreetMap services and their usage limits. The Nominatim fallback is a user-triggered, bounded best-match search; results may be incomplete. Street routing is an estimate and does not include live traffic. Speech recognition depends on browser support and microphone permission.
