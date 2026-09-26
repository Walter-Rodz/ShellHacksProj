# Retro Finder: Backend

The server behind the Retro Finder website. It stores the console catalog, answers the website's searches and
filters, and works out prices and companion recommendations. Console photos and brand logos live in the
frontend's `public/` folder, not here (see "Console photos" in section 3).

The website (the frontend) asks this server for data at addresses like `http://localhost:4000/api/devices` and
gets JSON back. This folder has no web pages.

**Built with:** Node.js, TypeScript, Express, and SQLite (a database stored as a single file, so there's nothing
extra to install).

---

## 1. Getting started

You need **Node.js 22.13 or newer** ([nodejs.org](https://nodejs.org)).

```bash
cd backend
npm install                            # download the libraries (first time only)
npm run import -- data/consoles.json   # load the 54 consoles into the database (first time only)
npm run dev                            # start the server
```

Check it works: open http://localhost:4000/api/devices in a browser. You should see a list of consoles.

Leave that terminal open while you work. Press `Ctrl+C` to stop the server. Your data is saved, so next time
just run `npm run dev`.

---

## 2. Everyday tasks

### Update the consoles after editing the spreadsheet

The console list lives in the team spreadsheet (`Console List.xlsx`). To get changes into the website:

```bash
pip install openpyxl                                   # first time only
npm run convert -- "path/to/Console List.xlsx"         # spreadsheet -> data/consoles.json
npm run import -- data/consoles.json                   # data/consoles.json -> database
```

The server picks up the changes within 30 seconds; there's no need to restart it. Consoles you delete from the
spreadsheet are deleted from the database too, along with their prices.

`convert` prints a list of values it had to **guess**, because the spreadsheet doesn't have them. Check that
list. To stop a guess, add the matching column to the spreadsheet:

| Add this column | What it controls | If it's missing |
|---|---|---|
| `Brand` | Brand name | Guessed from the model name ("RG…" → Anbernic) |
| `Form Factor` | `vertical`, `horizontal` or `clamshell` | Guessed from the name and the "Others" column |
| `Status` | `available`, `upcoming` or `discontinued` | `upcoming` if "Others" says rumored/concept/upcoming, otherwise `available` |
| `Price` | Current market price in USD (`48`, `$48`, `$48 (+ shipping)` all work) | No price is shown |
| `MSRP` | Original launch price in USD | Left empty |
| `Release Date` | Release date | Left empty |
| `Weight` | Weight in grams | Left empty |
| `Popularity` | Any number; higher shows first in the grid | Everything is 0, so the grid is alphabetical |

**Prices build a history over time.** Each import saves the `Price` column as that day's price. Update the prices
in the sheet and import again on another day, and the price chart, trend and deal flag fill in from the history.
Importing twice on the same day with the same prices doesn't add duplicates.

Two more things the converter does for you:
- **Emulation ratings** come from the "Games" column. "Up to PS1, NDS, PSP" means those systems and everything
  older are rated good or great. Newer systems are left unrated.
- **Missing details** like stick count or triggers are left as unknown instead of made up. The one exception:
  Android and Windows devices are assumed to have Wi-Fi and Bluetooth.

### Start over with a clean database

Stop the server, delete `data/retro.db`, then import again:

```bash
npm run import -- data/consoles.json
```

### Run the tests

```bash
npm test
```

The tests use their own temporary database, so they never touch your data.

### All commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the server (restarts itself when code changes) |
| `npm start` | Start the server (no auto-restart) |
| `npm run convert -- "<spreadsheet>"` | Turn the spreadsheet into `data/consoles.json` |
| `npm run import -- <file.json>` | Load a JSON file into the database |
| `npm test` | Run the tests |
| `npm run typecheck` | Check the code for type errors |
| `npm run format` | Tidy the code's formatting (run before committing) |

---

## 3. For the frontend team

### Connecting from Next.js

Forward `/api` to this server in `next.config.js`, so the frontend can use short paths like
`fetch('/api/devices')`:

```js
async rewrites() {
  return [
    { source: '/api/:path*', destination: 'http://localhost:4000/api/:path*' },
  ];
}
```

Copy [`src/types.ts`](src/types.ts) into the frontend. It describes the exact shape of every response.

### Which endpoint powers which part of the site

| Part of the site | Endpoint |
|---|---|
| Main grid of console cards | `GET /api/devices` → `items` (`total: 0` means show "No Consoles Found") |
| Search, filter pills, price slider, sort dropdown | `GET /api/devices` with filters → `facets` gives the pill options and counts |
| Side drawer (click a card) | `GET /api/devices/:slug` |
| Companion recommendation cards | `GET /api/devices/:slug` → `companions` |
| Full price chart | `GET /api/devices/:slug/prices` |
| Compare consoles side by side | `GET /api/compare?ids=rg35xxsp,miyoo-flip` (2 to 4 consoles) |
| List of emulated systems | `GET /api/systems` |
| AI recommendations from a user's answers | `POST /api/ai/recommend` |

`:slug` is the console's short id from its card, for example `rg35xxsp` or `retroid-pocket-5`.

### Console cards

Each item in `items` has what a card needs:

| Card shows | Field |
|---|---|
| Console image | From the frontend's `public/` folder, found by `slug` (see "Console photos" below) |
| Model name | `name` |
| Brand tag | `brand` |
| Form factor badge | `formFactor`: `vertical`, `horizontal` or `clamshell` |
| Starting market price | `startingPriceUsd`: the cheapest price in the last 30 days, else the latest price, else the launch price (`null` = unknown) |
| What to open on click | `slug` |

### Searching and filtering: `GET /api/devices`

Every filter is a URL parameter, so the page URL can hold the filters (like BuildCores). All are optional.
For lists, separate values with commas.

Example: `/api/devices?brand=Anbernic,Miyoo&formFactor=clamshell&tier=ps2_gc&priceMin=20&priceMax=500&sort=price_asc`

| Parameter | Example | Meaning |
|---|---|---|
| `q` | `rg35xx sp` | Search by name or brand (spaces and dashes don't matter) |
| `brand` | `Anbernic,Miyoo` | Manufacturer pills |
| `formFactor` | `vertical,clamshell` | Form factor pills: `vertical`, `horizontal`, `clamshell`, `home` |
| `tier` | `n64,ps2_gc` | Emulation tier pills: `ps1`, `n64`, `ps2_gc`, `switch` (plays **any** selected tier well) |
| `status` | `available` | `available`, `upcoming`, `discontinued` |
| `category` | `handheld` | `handheld` or `home` |
| `priceMin`, `priceMax` | `20`, `500` | Price slider, in USD (leave out `priceMax` for "$500+") |
| `screenMin`, `screenMax` | `3.5`, `5` | Screen size in inches |
| `panel` | `ips,oled` | Screen type |
| `aspect` | `4:3,16:9` | Screen shape |
| `os` | `android,onion` | Operating system (use the `value`s from `facets.os`) |
| `playsWell` | `psp,n64` | Runs **all** of these specific systems well |
| `fitFor` + `fitMin` | `gba` + `perfect` | Screen fits that system at least this well (`perfect`, `great`, `good`) |
| `sticks` | `2` | At least this many analog sticks |
| `hallSticks`, `triggers` | `true` | Has hall-effect sticks / L2+R2 triggers |
| `wifi`, `bluetooth`, `videoOut` | `true` | Has Wi-Fi / Bluetooth / video output |
| `batteryMin` | `6` | Battery life in hours |
| `sort` | `price_asc` | `popularity` (default), `price_asc`, `price_desc`, `newest` (release date), `name` |
| `page`, `pageSize` | `2`, `24` | Paging (at most 60 per page) |

The response looks like this:

```jsonc
{
  "items": [ { "slug": "rg35xxsp", "name": "RG35XXSP", "brand": "Anbernic", "formFactor": "clamshell",
               "startingPriceUsd": 64, ... } ],
  "total": 54,          // results for the current filters ("54 results")
  "page": 1, "pageSize": 24,
  "facets": {           // everything the filter controls need
    "tier": [ { "value": "ps1", "label": "PS1", "count": 53 }, { "value": "n64", "label": "N64", "count": 49 }, ... ],
    "brand": [ { "value": "Anbernic", "count": 33 }, ... ],
    "formFactor": [ { "value": "horizontal", "count": 30 }, { "value": "clamshell", "count": 11 }, ... ],
    "os": [ { "value": "onion", "label": "Onion OS", "count": 2 }, ... ],   // show `label` when present
    "priceRange": { "min": 45, "max": 620 },  // for the price slider; null if there are no prices yet
    "screenRange": { "min": 2.8, "max": 7 }
  }
}
```

Values ignore upper/lower case, and systems and tiers also accept common names: `playsWell=PS1,GameCube` works
the same as `playsWell=psx,gc`, and `tier=PS2/GC` the same as `tier=ps2_gc`. The full list of names is in
[`src/lib/aliases.ts`](src/lib/aliases.ts).

Several values in one parameter (`brand=Anbernic,Miyoo`) match consoles with **any** of them, like pills
usually do. The counts stay useful while a pill is selected: with "Vertical" selected, `formFactor` still shows
how many clamshells there are. The four `tier` pills are always listed, in order, even when a count is 0.

### Side drawer: `GET /api/devices/:slug`

Everything the drawer shows, in one request:

| Drawer section | Field |
|---|---|
| Header and large image | `name`, `brand`, plus the photo and logo from `public/` (see "Console photos" below) |
| Description | `summary` |
| Specs grid (two columns) | `specTable`: a list of `{ label, value }` rows, ready to render. Rows with unknown values are left out |
| Price metrics widget | `price.avgUsd` ("Average Current Market Price"), `priceChart` (weekly prices for the mini chart), `deal.isGoodDeal` |
| Companion cards | `companions` (see below) |
| Extra detail if wanted | `specs` (raw), `os` (stock and custom), `emulation` (rating per system), `screenFit` (score per system), `communityActivity` |

**Missing data is `null` or left out, and means "unknown", not "no".** `price.sampleSize` says how many prices the
average comes from (for example "based on 1 price"); with 0 prices the price fields are `null`.

### Companion recommendations: `companions`

```jsonc
"companions": {
  "items": [   // 1 or 2 devices
    { "device": { "slug": "miyoo-flip", "name": "Miyoo Flip", ... }, "role": "Pocket-sized clamshell for GBA and retro games on the go" },
    { "device": { "slug": "rg35xxsp", "name": "RG35XXSP", ... }, "role": "Pocket-sized clamshell for GBA and retro games on the go" }
  ],
  "whyTheyPairWell": "Use the Retroid Pocket 6 for Switch/3DS at home, and keep the Miyoo Flip or the RG35XXSP in your pocket for quick GBA sessions on the go.",
  "totalCostUsd": 527   // the viewed console + the companions; null if any price is unknown
}
```

- Viewing a big or powerful console suggests pocket-sized clamshells or verticals (clamshells first, then cheapest).
- Viewing a pocket console suggests bigger consoles that play the systems it can't.
- Clicking a companion card: load `GET /api/devices/<companion slug>` into the drawer.
- Hand-picked pairs (the `pairs` list in the import file) always come first.

### Console photos and brand logos

Images are part of the frontend: put them in its `public/` folder and name them after the console's `slug` and
the brand, so the page can build the path from the data it already has. For example:

```
public/consoles/rg35xxsp.png          ->  <img src={`/consoles/${device.slug}.png`}>
public/consoles/retroid-pocket-5.png
public/brands/anbernic.png            ->  <img src={`/brands/${device.brand.toLowerCase()}.png`}>
```

The full list of slugs is in `GET /api/devices?pageSize=60` (or `data/consoles.json`). Show a placeholder when a
file is missing.

### AI recommendations: `POST /api/ai/recommend`

Send what the user wants in plain words, and get the top 3 matching consoles back:

```jsonc
// Request body
{ "answers": "clamshell under $150 that plays PS1 and GBA" }

// Response
{
  "query": { "formFactor": ["clamshell"], "priceMax": 150, "playsWell": ["psx", "gba"], ... },  // the filters Gemini picked
  "matches": [ { "slug": "...", "name": "...", ... } ]   // up to 3 console cards
}
```

Gemini turns the answers into the same filters `GET /api/devices` uses, then the normal search picks the
consoles. Without a `GEMINI_API_KEY` (or if Gemini fails) it falls back to a plain name search on the answers.
An empty `answers` returns `400 { "error": "answers required" }`.

### Errors

When something goes wrong, the status code says what kind of problem it is, and the body explains it:

```json
{ "error": { "code": "not_found", "message": "Device not found" } }
```

| Status | `code` | Usually means |
|---|---|---|
| 400 | `bad_request` | A parameter is wrong (`details` says which) |
| 404 | `not_found` | That console doesn't exist |
| 500 | `internal` | A bug on the server |

---

## 4. How the numbers are worked out

- **Starting price (cards):** the cheapest price seen in the last 30 days. If prices haven't been updated for
  30 days, the most recent price; with no prices at all, the launch price. The price slider and sorting use this.
- **Average price (drawer):** the average of all prices seen in the last 90 days, from however many there are
  (`price.sampleSize`).
- **Price trend:** this month's typical (median) price compared with last month's: `up`, `down`, or `flat` when
  the change is within 3%. Needs at least 3 prices in each month, otherwise `unknown`.
- **Good deal:** a listing from the last week that is at least 15% cheaper than the typical price over 90 days
  (needs at least 3 prices in those 90 days).
- **Price chart markers:** the release date, plus any week where the typical price moved 10% or more.
- **Screen-fit score (0–100):** how much of the screen a system's games fill without looking blurry. Old games
  are small (a GBA is 240×160 pixels), and they look sharpest when scaled up by a whole number (2×, 3×…).
  - `perfect`: pixel-perfect and fills the screen.
  - `great` / `good`: small borders or slight blur.
  - `borders`: large black bars.

  Example: a 720×480 screen shows GBA games at exactly 3×, which is `perfect`.
- **Emulation tiers:** a console is in a tier when it plays every system in it at least "good": PS1, N64,
  PS2 and GameCube (both), or Switch.
- **Companions:** "pocket-sized" means a clamshell or vertical with a screen of 3.6" or less. A big console gets
  pocket companions; a pocket console gets bigger companions that play what it can't.

---

## 5. Settings

Settings are read from a `.env` file in this folder. Copy `.env.example` to `.env` to change them. Everything
works without one on your own computer.

| Setting | Default | What it's for |
|---|---|---|
| `PORT` | `4000` | Port the server runs on |
| `DATABASE_PATH` | `./data/retro.db` | Where the database file is |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Website addresses allowed to call the server directly |
| `GEMINI_API_KEY` | none | Google Gemini key for AI recommendations. Without it, the AI endpoint does a plain search |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Which Gemini model to use |

The database (`data/retro.db`) and `.env` are not saved to git. Each person imports their own copy.

---

## 6. Where things are

```
backend/
  data/consoles.json          the console catalog, made from the spreadsheet
  scripts/convert_spreadsheet.py   spreadsheet -> data/consoles.json
  src/
    app.ts                    list of all routes (start reading here)
    types.ts                  shape of every response (copy into the frontend)
    routes/                   catalog.ts (catalog endpoints), ai.ts (AI recommendations)
    services/                 the logic: search.ts (filters, pills, sorting), deviceDetail.ts (drawer,
                              specs table, companions), catalog.ts (loading the catalog),
                              ai.ts (Gemini: turns a user's answers into search filters)
    lib/                      pricing math, screen-fit math, error handling
    db/                       database tables and the importer
  test/                       automated tests
```

### Importing other data (advanced)

`npm run import` accepts any JSON file shaped like
[`data/example-import.json`](data/example-import.json), which shows every field:

```json
{ "systems": [...], "devices": [...], "pricePoints": [...], "pairs": [...] }
```

- Importing is safe to repeat. Consoles and systems are updated by `id`, and duplicate prices are skipped.
- If any record is invalid, nothing from that file is saved, and the error names the bad field.
- `pricePoints` is how price history gets in: one entry per observed price, with `deviceId`, `observedAt` (date),
  `priceUsd` and `condition` (`new`, `used` or `refurb`).
- `pairs` are hand-picked companion suggestions (`deviceId`, `pairDeviceId`, `reason`), shown before the automatic
  ones, with `reason` used as the companion's role.

The database tables are described in [`src/db/schema.sql`](src/db/schema.sql). If you change an existing
table there, delete `data/retro.db` and import again.
