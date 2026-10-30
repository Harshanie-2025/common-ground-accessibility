# Last 100 m — One Street, Four Realities

Standalone Vite project converted from the supplied single-file HTML prototype. No backend or map key is required.

## Run it

Requires Node.js 20 or newer. In a terminal:

```bash
cd last-100-metres
npm install
npm run dev
```

Open the local address printed by Vite. To build a deployable version, run `npm run build`.

## Features

- A tap-to-report neighborhood map, seeded barriers, map-based pins, and street priority colors.
- Four accessibility personas plus an everyone view; scores and rankings respond to the selected person.
- Plain-language Top 10 queue and a breakdown of impact, nearby footfall, confirmations, and time unresolved.
- Report categories, map pin, photo attachment, multilingual text classification, and optional browser speech recognition in English, Hindi, and Kannada.
- Nearby duplicate detection and merging.
- Route planning between a hospital, school, bus stop, market, and metro station, with barriers and possible unblock fixes.
- A rupee-denominated repair budget planner ranked by priority per rupee, including a comparison of remaining barrier load for all four personas.
- Confirm a repair, attach an after photo, view a before/after comparison, and print a ward brief.
- Responsive layout, system dark mode, keyboard focus styles, and reduced-motion support.

## Source structure

```text
last-100-metres/
├── index.html
├── package.json
├── README.md
└── src/
    ├── main.js        # App state, UI rendering, and interactions
    ├── styles.css     # Layout, theme, and responsive styles
    ├── data.js        # Personas, issue seeds, places, and repair costs
    ├── scoring.js     # Priority scoring and explanations
    ├── streets.js     # Schematic street graph and route utilities
    └── reporting.js   # English, Hindi, and Kannada issue suggestions
```

The score is an explainable demo heuristic. Reports and photo previews stay in browser memory and reset when the page is refreshed. Speech recognition depends on browser support and microphone permission.
