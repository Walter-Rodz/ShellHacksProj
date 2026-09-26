# Retro Finder: Backend

The server behind the Retro Finder website. It stores the console catalog, answers the website's searches and
filters, works out prices and companion recommendations, and serves console photos and brand logos.

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
spreadsheet are deleted from the database too, along with their prices and photos.

`convert` prints a list of values it had to **guess**, because the spreadsheet doesn't have them. Check that
list. To stop a guess, add the matching column to the spreadsheet:

| Add this column | What it controls | If it's missing |
|---|---|---|
| `Brand` | Brand name | Guessed from the model name ("RG…" → Anbernic) |
| `Form Factor` | `vertical`, `horizontal` or `clamshell` | Guessed from the name and the "Others" column |
| `Status` | `available`, `upcoming` or `discontinued` | `upcoming` if "Others" says rumored/concept/upcoming, otherwise `available` |
| `Price` | List price (MSRP) in USD | No price is shown |
| `Release Date` | Release date | Left empty |
| `Weight` | Weight in grams | Left empty |
| `Popularity` | Any number; higher shows first in the grid | Everything is 0, so the grid is alphabetical |

Two more things the converter does for you:
- **Emulation ratings** come from the "Games" column. "Up to PS1, NDS, PSP" means those systems and everything
  older are rated good or great. Newer systems are left unrated.
- **Missing details** like stick count or triggers are left as unknown instead of made up. The one exception:
  Android and Windows devices are assumed to have Wi-Fi and Bluetooth.

### Add console photos

Photos are uploaded to this server and stored in the `uploads/` folder. They are files, not links.

The easy way is to put all the photos in one folder, **named after the consoles**, and run:

```bash
npm run images -- "path/to/photos"             # adds photos to consoles that don't have any yet
npm run images -- "path/to/photos" --replace   # replaces existing photos
```

- `RG35XXSP.png`, `rg35xxsp.jpg` and `Miyoo Mini +.webp` all match the right console.
- For more than one photo, add a number: `RG35XXSP 2.png`, `RG35XXSP 3.png`. The one without a number is the
  cover photo shown in the grid.
- Only PNG, JPEG and WebP files up to 8 MB are accepted.
- The command lists any files it couldn't match and which consoles still have no photo.

To upload one photo at a time (for example from a future admin page), see "Photos and logos" in section 3.

### Add brand logos

Put the logos in one folder, **named after the brands** (`Anbernic.png`, `Miyoo.png`, `TrimUI.webp`…), and run:

```bash
npm run logos -- "path/to/logos"
```

Each logo appears on every card of that brand and in the side drawer. Running it again replaces the logos.

### Start over with a clean database

Stop the server, delete `data/retro.db`, then import again:

```bash
npm run import -- data/consoles.json
```

The consoles lose their photos and logos too. Delete the `uploads/` folder as well, then run `npm run images` and
`npm run logos` again.

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
| `npm run images -- <folder>` | Attach a folder of console photos |
| `npm run logos -- <folder>` | Attach a folder of brand logos |
| `npm test` | Run the tests |
| `npm run typecheck` | Check the code for type errors |
| `npm run format` | Tidy the code's formatting (run before committing) |

---

## 3. For the frontend team

### Connecting from Next.js

Forward `/api` and `/uploads` to this server in `next.config.js`, so the frontend can use short paths like
`fetch('/api/devices')` and `<img src={device.imageUrl}>`:

```js
async rewrites() {
  return [
    { source: '/api/:path*', destination: 'http://localhost:4000/api/:path*' },
    { source: '/uploads/:path*', destination: 'http://localhost:4000/uploads/:path*' },
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

`:slug` is the console's short id from its card, for example `rg35xxsp` or `retroid-pocket-5`.

### Console cards

Each item in `items` has what a card needs:

| Card shows | Field |
|---|---|
| Console image | `imageUrl` (`null` = no photo yet, show a placeholder) |
| Model name | `name` |
| Brand tag | `brand`, plus `brandLogoUrl` if a logo was uploaded |
| Form factor badge | `formFactor`: `vertical`, `horizontal` or `clamshell` |
| Starting market price | `startingPriceUsd`: the cheapest price in the last 30 days, or the launch price if there's no recent price (`null` = unknown) |
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
               "imageUrl": "/uploads/...", "startingPriceUsd": 64, ... } ],
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

Several values in one parameter (`brand=Anbernic,Miyoo`) match consoles with **any** of them, like pills
usually do. The counts stay useful while a pill is selected: with "Vertical" selected, `formFactor` still shows
how many clamshells there are. The four `tier` pills are always listed, in order, even when a count is 0.

### Side drawer: `GET /api/devices/:slug`

Everything the drawer shows, in one request:

| Drawer section | Field |
|---|---|
| Header and large image | `name`, `brandLogoUrl`, `images` (all photos, cover first) |
| Description | `summary` |
| Specs grid (two columns) | `specTable`: a list of `{ label, value }` rows, ready to render. Rows with unknown values are left out |
| Price metrics widget | `price.avgUsd` ("Average Current Market Price"), `priceChart` (weekly prices for the mini chart), `deal.isGoodDeal` |
| Companion cards | `companions` (see below) |
| Extra detail if wanted | `specs` (raw), `os` (stock and custom), `emulation` (rating per system), `screenFit` (score per system), `communityActivity` |

**Missing data is `null` or left out, and means "unknown", not "no".** Prices are `null` until price data is
added, so show "No price data" for those.

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

### Photos and logos (team only)

These need the header `x-admin-key: <ADMIN_KEY>` (locally the key is `dev-admin-key`), so visitors can't
change them.

| Request | Does |
|---|---|
| `POST /api/devices/:slug/images` | Upload console photos: form data, file(s) in a field called `image`. Add `?cover=true` to make the first one the cover |
| `POST /api/devices/:slug/images/:imageId/cover` | Make a photo the cover |
| `DELETE /api/devices/:slug/images/:imageId` | Delete a photo |
| `PUT /api/brands/:brand/logo` | Upload or replace a brand's logo: form data, file in a field called `image` |

Example upload from Windows PowerShell:
```powershell
curl.exe -X POST http://localhost:4000/api/devices/rg35xxsp/images -H "x-admin-key: dev-admin-key" -F "image=@C:\path\to\photo.png"
```

### Errors

When something goes wrong, the status code says what kind of problem it is, and the body explains it:

```json
{ "error": { "code": "not_found", "message": "Device not found" } }
```

| Status | `code` | Usually means |
|---|---|---|
| 400 | `bad_request` | A parameter is wrong (`details` says which) |
| 401 | `unauthorized` | Missing or wrong admin key (photo and logo uploads only) |
| 404 | `not_found` | That console, photo or brand doesn't exist |
| 500 | `internal` | A bug on the server |

---

## 4. How the numbers are worked out

- **Starting price (cards):** the cheapest price seen in the last 30 days, or the launch price when there's no
  recent price. The price slider and price sorting use this.
- **Average price (drawer):** the average of all prices seen in the last 90 days. Shown only with at least 3 prices;
  otherwise it's `null` ("not enough data").
- **Price trend:** this month's typical (median) price compared with last month's: `up`, `down`, or `flat` when
  the change is within 3%.
- **Good deal:** a listing from the last week that is at least 15% cheaper than the typical price over 90 days.
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
| `UPLOADS_DIR` | `./uploads` | Where photos and logos are stored |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Website addresses allowed to call the server directly |
| `ADMIN_KEY` | `dev-admin-key` | Key for uploading photos and logos. **Must be set when deployed** |

When deployed (`NODE_ENV=production`), the server refuses to start without `ADMIN_KEY`.

The database (`data/retro.db`), `uploads/` and `.env` are not saved to git. Each person imports their own copy.

---

## 6. Where things are

```
backend/
  data/consoles.json          the console catalog, made from the spreadsheet
  scripts/convert_spreadsheet.py   spreadsheet -> data/consoles.json
  src/
    app.ts                    list of all routes (start reading here)
    types.ts                  shape of every response (copy into the frontend)
    routes/                   catalog.ts (public data), images.ts (photo and logo uploads)
    services/                 the logic: search.ts (filters, pills, sorting), deviceDetail.ts (drawer,
                              specs table, companions), catalog.ts (loading), images.ts (photo storage)
    lib/                      pricing math, screen-fit math, error handling
    db/                       database tables, importer, photo and logo loaders
    middleware/requireAdmin.ts   checks the admin key
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
