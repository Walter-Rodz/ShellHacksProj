"""
Convert the team's console spreadsheet into the backend's import format.

    python scripts/convert_spreadsheet.py "path/to/Console List.xlsx" [-o data/consoles.json]
    npm run import -- data/consoles.json

Expected columns (first row = headers, matched case-insensitively):
    Console List | Color | Screen | CPU | GPU | RAM | Storage | System | Games | Speaker | TF card | Battery |
    Charging | Others
Optional columns that override the guesses below if you add them:
    Brand | Form Factor | Release Date | Status | Weight
    Price  (current market price in USD, e.g. "48" or "$48 (+ shipping)"; saved as today's price observation,
            so re-importing an updated sheet on a later day builds the price history)
    MSRP / Launch Price  (the original launch price in USD)
    Popularity  (any whole number; higher sorts first on the default "popular" sort)

Free-text cells are parsed with regexes. Anything that isn't in the sheet is either left out (unknown) or guessed
from the model name / "Others" column, and every guess is listed in the report printed at the end so it can be
checked. Requires: pip install openpyxl
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import sys
from pathlib import Path

import openpyxl

# --------------------------------------------------------------------------------------------- systems
# Native resolutions of the emulated systems (used for screen-fit scores). `tier` is a rough performance
# ladder used to turn the "Games" column into ratings.
SYSTEMS = [
    # id, name, generation, w, h, aspect, dual, tier
    ("gb", "Game Boy", 4, 160, 144, "10:9", False, 0),
    ("gbc", "Game Boy Color", 5, 160, 144, "10:9", False, 0),
    ("gba", "Game Boy Advance", 6, 240, 160, "3:2", False, 0),
    ("gg", "Game Gear", 4, 160, 144, "10:9", False, 0),
    ("nes", "NES", 3, 256, 224, "4:3", False, 0),
    ("snes", "SNES", 4, 256, 224, "4:3", False, 0),
    ("md", "Mega Drive / Genesis", 4, 320, 224, "4:3", False, 0),
    ("pce", "PC Engine", 4, 256, 224, "4:3", False, 0),
    ("arcade", "Arcade", 4, 320, 224, "4:3", False, 0),
    ("pico8", "PICO-8", 8, 128, 128, "1:1", False, 0),
    ("psx", "PlayStation", 5, 320, 240, "4:3", False, 1),
    ("n64", "Nintendo 64", 5, 320, 240, "4:3", False, 2),
    ("saturn", "Sega Saturn", 5, 320, 224, "4:3", False, 2),
    ("nds", "Nintendo DS", 7, 256, 192, "4:3", True, 2),
    ("dc", "Dreamcast", 6, 640, 480, "4:3", False, 3),
    ("psp", "PSP", 7, 480, 272, "16:9", False, 3),
    ("gc", "GameCube", 6, 640, 480, "4:3", False, 4),
    ("ps2", "PlayStation 2", 6, 640, 448, "4:3", False, 4),
    ("wii", "Wii", 7, 640, 480, "4:3", False, 4),
    ("3ds", "Nintendo 3DS", 8, 400, 240, "5:3", True, 4),
    ("vita", "PS Vita", 8, 960, 544, "16:9", False, 5),
    ("switch", "Nintendo Switch", 8, 1280, 720, "16:9", False, 5),
]
TIER = {s[0]: s[7] for s in SYSTEMS}

# Order matters: more specific patterns first ("3DS" before "DS", "PS2" before "PS").
GAME_PATTERNS = [
    (r"\b3ds\b", ["3ds"]),
    (r"\b(nds|nintendo ds)\b", ["nds"]),
    (r"\bgb\s*/\s*gbc\b", ["gb", "gbc"]),
    (r"\bgbc\b", ["gbc"]),
    (r"\bgba\b", ["gba"]),
    (r"\b(ps ?)?vita\b(?!\s*style)", ["vita"]),  # "PS Vita style" describes the shape, not the games
    (r"\bps2\b", ["ps2"]),
    (r"\b(ps1|psx|playstation)\b", ["psx"]),
    (r"\bpsp\b", ["psp"]),
    (r"\bn64\b", ["n64"]),
    (r"\b(dc|dreamcast)\b", ["dc"]),
    (r"\bsaturn\b", ["saturn"]),
    (r"\bgamecube\b", ["gc"]),
    (r"\bwii\b", ["wii"]),
    (r"\bswitch\b", ["switch"]),
    (r"\bpico-?8\b", ["pico8"]),
    (r"\barcade\b", ["arcade"]),
    (r"\b(md|mega drive|genesis)\b", ["md"]),
    (r"\b(sfc|snes)\b", ["snes"]),
    (r"\bnes\b", ["nes"]),
]


def emulation_from_games(text: str) -> dict[str, str]:
    """
    Ratings from phrases like "Up to PS1, NDS, PSP":
      - every 8/16-bit system, and anything below the lowest listed tier -> great
      - listed systems, and unlisted ones below the highest listed tier -> good ("up to X" covers them)
      - anything else -> left unrated (unknown)
    """
    t = text.lower()
    listed: list[str] = []
    for pattern, ids in GAME_PATTERNS:
        if re.search(pattern, t):
            listed += [i for i in ids if i not in listed]
    if not listed:
        return {}
    lo = min(TIER[s] for s in listed)
    hi = max(TIER[s] for s in listed)
    out: dict[str, str] = {}
    for sid, tier in TIER.items():
        if tier == 0 or tier < lo:
            out[sid] = "great"
        elif sid in listed or tier < hi:
            out[sid] = "good"
    return out


# --------------------------------------------------------------------------------------------- parsing
COMMON_RATIOS = {
    "4:3": 4 / 3,
    "16:9": 16 / 9,
    "3:2": 3 / 2,
    "1:1": 1.0,
    "5:3": 5 / 3,
    "16:10": 16 / 10,
    "10:9": 10 / 9,
}


def aspect_of(w: int, h: int) -> str:
    r = w / h
    best = min(COMMON_RATIOS.items(), key=lambda kv: abs(kv[1] - r))
    if abs(best[1] - r) / r < 0.02:
        return best[0]
    g = math.gcd(w, h)
    return f"{w // g}:{h // g}"


def parse_screen(text: str, guesses: list[str]):
    """
    Reads cells like '3.5-inch IPS 640x480', '5.46-inch IPS touchscreen, resolution 1280*720',
    'Dual 4-inch IPS 640*480' (two identical screens) and
    'Main display: 5.5-inch OLED 1080p, secondary display: 4.5-inch 1280 x 960' (two different screens).
    """
    t = text or ""
    two_parts = re.split(r"secondary display:", t, flags=re.I)
    if len(two_parts) == 2:
        main = parse_one_screen(re.sub(r"^\s*main display:\s*", "", two_parts[0], flags=re.I), guesses)
        second = parse_one_screen(two_parts[1], guesses, fallback_panel=main["panel"] if main else "ips")
        if main and second:
            main["secondary"] = second
        return main

    screen = parse_one_screen(t, guesses)
    if screen and re.match(r"\s*dual\b", t, re.I):
        screen["secondary"] = dict(screen)
    return screen


def parse_one_screen(text: str, guesses: list[str], fallback_panel: str = "ips"):
    size = re.search(r"(\d+(?:\.\d+)?)\s*(?:-?\s*inch|\"|”|in\b)", text, re.I)
    res = re.search(r"(\d{3,4})\s*[x×*]\s*(\d{3,4})", text)
    p_res = re.search(r"\b(\d{3,4})p\b", text, re.I)
    if res:
        w, h = int(res.group(1)), int(res.group(2))
    elif p_res:
        h = int(p_res.group(1))
        w = round(h * 16 / 9)
        guesses.append(f"resolution {p_res.group(0)} read as {w}x{h} (16:9)")
    else:
        return None

    if re.search(r"amoled", text, re.I):
        panel = "amoled"
    elif re.search(r"oled", text, re.I):
        panel = "oled"
    elif re.search(r"\blcd\b", text, re.I):
        panel = "lcd"
    elif re.search(r"\bips\b", text, re.I):
        panel = "ips"
    else:
        panel = fallback_panel
        guesses.append(f"panel type not given for '{text.strip()}', assumed {panel.upper()}")

    ratio = re.search(r"\((\d+):(\d+)", text)
    if not size:
        guesses.append("screen size missing")
    return {
        "sizeIn": float(size.group(1)) if size else 0,
        "resolution": {"w": w, "h": h},
        "panel": panel,
        "aspectRatio": f"{ratio.group(1)}:{ratio.group(2)}" if ratio else aspect_of(w, h),
        "touch": bool(re.search(r"touch", text, re.I)),
    }


def parse_gb(text: str | None) -> float | None:
    """First size in the cell, in GB ('128MB' -> 0.125, '1TB' -> 1024)."""
    if not text:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*(TB|GB|MB)", text, re.I)
    if not m:
        return None
    n = float(m.group(1))
    unit = m.group(2).upper()
    return n * 1024 if unit == "TB" else n / 1024 if unit == "MB" else n


def parse_storage(text: str | None, tf: str | None):
    t = text or ""
    internal = 0.0
    # "64GB MicroSD" is a bundled card, not built-in storage
    if re.search(r"emmc|ufs|nvme|\(system\)|linux|\d+\s*gb\s*$|^\d+\s*gb\s*/", t, re.I) and not re.search(
        r"^\s*\d+\s*gb\s*micro", t, re.I
    ):
        internal = parse_gb(t) or 0.0
    expandable = bool(tf) and not re.fullmatch(r"\s*(na|n/a|none|-)?\s*", tf or "", re.I)
    storage = {"internalGb": internal, "expandable": expandable}
    if t and t.upper() != "NA":
        storage["note"] = t
    return storage


def parse_battery(text: str | None):
    t = text or ""
    mah = re.search(r"(\d{3,5})\s*mAh", t, re.I)
    hrs = re.search(r"\(?\s*(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*hrs?", t, re.I)
    out = {}
    if mah:
        out["batteryMah"] = int(mah.group(1))
    if hrs:
        lo = float(hrs.group(1))
        hi = float(hrs.group(2)) if hrs.group(2) else lo
        out["batteryLifeHrs"] = {"min": lo, "max": hi}
    return out


def parse_os(text: str | None):
    """'Android 13 / Linux Batocera' -> stock Android 13 + custom Batocera, etc."""
    opts: list[dict] = []

    def add(id_, name, kind):
        if not any(o["id"] == id_ for o in opts):
            opts.append({"id": id_, "name": name, "kind": kind})

    for part in re.split(r"\s+/\s+|\s*\+\s*", text or ""):
        p = part.strip()
        pl = p.lower()
        if not p:
            continue
        if "android" in pl:
            add(
                "android",
                re.sub(r"\s+", " ", re.search(r"android[\s\d/.]*", p, re.I).group(0)).strip().title(),
                "stock",
            )
        if "linux" in pl:
            add("linux", "Linux", "stock")
        if "windows" in pl:
            add("windows", p, "stock")
        if "steamos" in pl:
            add("steamos", "SteamOS", "stock")
        if "arkos" in pl:
            add("arkos", "ArkOS", "custom")
        if "onion" in pl:
            add("onion", "Onion OS", "custom")
        if "batocera" in pl:
            add("batocera", "Batocera", "custom")
    return opts


def parse_controls_connectivity(others: str, os_ids: list[str], guesses: list[str]):
    o = others.lower()
    controls: dict = {}
    conn: dict = {}
    hall = re.search(
        r"hall\s*(sensor\s*)?(analogs?|sticks?|joysticks?|thumbsticks?)|(joysticks?|sticks?|analogs?)[^,]*hall",
        o,
    )
    if hall or re.search(
        r"dual\s+(hall\s+)?(analog|joystick|thumbstick)|\banalogs\b|\bjoysticks\b|\bthumbsticks\b|\bsticks\b",
        o,
    ):
        controls["analogSticks"] = 2
    if hall:
        controls["stickType"] = "hall"
    if re.search(r"vibration|rumble", o):
        controls["rumble"] = True
    six = re.search(r"(\d+)-button", o)
    if six:
        controls["faceButtons"] = int(six.group(1))

    if re.search(r"wi-?fi", o):
        conn["wifi"] = True
    if re.search(r"\bbt\b|bluetooth", o):
        conn["bluetooth"] = True
    if re.search(r"mini-?hdmi", o):
        conn["videoOut"] = "mini_hdmi"
    if re.search(r"3\.5\s*mm|headphone", o):
        conn["headphoneJack"] = True
    if any(i in os_ids for i in ("android", "windows")) and not ("wifi" in conn and "bluetooth" in conn):
        conn.setdefault("wifi", True)
        conn.setdefault("bluetooth", True)
        guesses.append("Wi-Fi/Bluetooth assumed (Android/Windows device)")
    return controls, conn


# --------------------------------------------------------------------------------------------- guesses
BRANDS = [
    (r"^(rg|cubexx)", "Anbernic"),
    (r"^miyoo", "Miyoo"),
    (r"^trimui", "TrimUI"),
    (r"^retroid", "Retroid"),
    (r"^(ayn|thor|odin)", "AYN"),
    (r"^batlexp", "BatleXP"),
    (r"^mangmi", "Mangmi"),
    (r"^miniloong", "Miniloong"),
    (r"^r36", "Generic (R36 clone)"),
]

# Used only when neither a "Form Factor" column nor the Others/Screen text says so.
FORM_FACTOR_FALLBACK = {
    "r36s": "vertical",
    "rg28xx": "vertical",
    "miyoo-mini-plus": "vertical",
    "trimui-brick": "vertical",
    "trimui-brick-pro": "vertical",
    "miniloong-pocket": "vertical",
    "rg-arc-s": "vertical",
    "rg-rotate-plastic": "vertical",
    "rg-rotate-metal": "vertical",
    "thor-base": "clamshell",
    "ayn-thor-pro": "clamshell",
}


def guess_form_factor(name: str, slug: str, screen_text: str, others: str) -> tuple[str, bool]:
    """Returns (form factor, was_guessed_from_name)."""
    o = f"{others} {screen_text}".lower()
    if re.search(r"clamshell|flip|\bsp (design|format)|dual-screen|dual screen|advance sp", o) or re.match(
        r"\s*dual\b", screen_text, re.I
    ):
        return "clamshell", False
    if re.search(r"vertical", o):
        return "vertical", False
    if re.search(r"horizontal|snes (controller )?(style|design)|psp go|vita style", o):
        return "horizontal", False
    n = name.lower()
    if re.search(r"flip|duo|sp$", n.replace(" ", "")):
        return "clamshell", True
    if re.search(r"\d+\s*h$|xx\s*h$", n):
        return "horizontal", True
    if re.search(r"\d+\s*v$|xx\s*v$", n):
        return "vertical", True
    return FORM_FACTOR_FALLBACK.get(slug, "horizontal"), True


def parse_usd(value) -> float | None:
    """48, "48", "$48", "$1,299.99 (+ shipping)" -> the number; anything without a number -> None"""
    if value is None:
        return None
    m = re.search(r"\d+(?:\.\d+)?", str(value).replace(",", ""))
    return float(m.group(0)) if m else None


def slugify(name: str) -> str:
    s = name.lower().replace("+", " plus")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def split_list(text: str | None, sep: str = "/") -> list[str]:
    return [p.strip() for p in (text or "").split(sep) if p.strip()]


def cell(row: dict, *names: str):
    for n in names:
        v = row.get(n.lower())
        if v is not None and str(v).strip() != "":
            return v if not isinstance(v, str) else v.strip()
    return None


# --------------------------------------------------------------------------------------------- main
def convert(path: Path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    headers = [str(h).strip().lower() if h is not None else "" for h in next(rows)]
    name_col = headers[0]  # first column holds the console name ("Console List")

    devices, price_points, report = [], [], []
    today = dt.date.today().isoformat()
    seen: set[str] = set()
    for line, values in enumerate(rows, start=2):
        row = dict(zip(headers, values))
        name = cell(row, name_col, "name", "console")
        if not name:
            continue
        name = str(name)
        slug = slugify(name)
        if slug in seen:
            report.append(f"row {line} {name}: SKIPPED, duplicate of an earlier row")
            continue
        seen.add(slug)
        guesses: list[str] = []

        screen_text = str(cell(row, "screen") or "")
        others = str(cell(row, "others") or "")
        system_text = str(cell(row, "system") or "")

        brand = cell(row, "brand")
        if not brand:
            brand = next((b for pat, b in BRANDS if re.search(pat, name.lower())), "Unknown")
            if brand == "Unknown":
                guesses.append("brand unknown (add a Brand column)")

        form = cell(row, "form factor", "formfactor", "shape")
        if form:
            form = str(form).lower()
        else:
            form, from_name = guess_form_factor(name, slug, screen_text, others)
            if from_name:
                guesses.append(f"form factor '{form}' guessed from model name")

        status = cell(row, "status")
        if status:
            status = str(status).lower()
        elif re.search(r"rumou?red|concept|upcoming", others, re.I):
            status = "upcoming"
            guesses.append("status 'upcoming' (Others says rumored/concept/upcoming)")
        else:
            status = "available"

        screen = parse_screen(screen_text, guesses)
        if screen is None:
            guesses.append(f"could not read screen '{screen_text}'")

        os_opts = parse_os(system_text)
        controls, conn = parse_controls_connectivity(others, [o["id"] for o in os_opts], guesses)

        ram = parse_gb(str(cell(row, "ram") or ""))
        if ram is not None and re.search(r"\d\s*(gb|mb)?\s*[-/]\s*\d", str(cell(row, "ram")), re.I):
            guesses.append(f"RAM '{cell(row, 'ram')}' is a range; used the lowest")

        cpu = str(cell(row, "cpu") or "")
        specs = {
            "chip": cpu or "Unknown",
            "cpu": cpu or None,
            "gpu": cell(row, "gpu"),
            "ramGb": ram if ram is not None else 0,
            "storage": parse_storage(str(cell(row, "storage") or ""), cell(row, "tf card", "sd card")),
            **({"screen": screen} if screen else {}),
            **parse_battery(str(cell(row, "battery") or "")),
            "controls": controls,
            "connectivity": conn,
            "colors": split_list(cell(row, "color", "colors")),
            "speakers": cell(row, "speaker", "speakers"),
            "charging": cell(row, "charging"),
            "features": split_list(others, ","),
        }
        weight = cell(row, "weight")
        if weight is not None:
            m = re.search(r"\d+(?:\.\d+)?", str(weight))
            if m:
                specs["weightG"] = float(m.group(0))
        specs = {k: v for k, v in specs.items() if v not in (None, [], "")}

        games = str(cell(row, "games") or "")
        ratings = emulation_from_games(games)
        if not ratings:
            guesses.append(f"no emulation ratings: couldn't read Games '{games}'")

        market_price = parse_usd(cell(row, "price"))
        if cell(row, "price") is not None and market_price is None:
            guesses.append(f"couldn't read Price '{cell(row, 'price')}'")
        if market_price is not None:
            price_points.append(
                {
                    "deviceId": slug,
                    "observedAt": today,
                    "priceUsd": market_price,
                    "condition": "new",
                    "source": "spreadsheet",
                }
            )
        msrp = parse_usd(cell(row, "msrp", "launch price"))
        release = cell(row, "release date", "release")
        if isinstance(release, (dt.date, dt.datetime)):
            release = release.strftime("%Y-%m-%d")

        compact = re.sub(r"[^a-z0-9]", "", name.lower())
        devices.append(
            {
                "id": slug,
                "slug": slug,
                "name": name,
                "brand": str(brand),
                "category": "handheld",
                "formFactor": form,
                "releaseDate": release,
                "msrpUsd": msrp,
                "status": status,
                "summary": others,
                "popularity": int(float(cell(row, "popularity") or 0)),
                "aliases": [compact] if compact != name.lower() else [],
                "specs": specs,
                "os": os_opts,
                "emulation": [
                    {"systemId": sid, "rating": r, "notes": f"From spreadsheet: '{games}'"}
                    for sid, r in ratings.items()
                ],
            }
        )
        if guesses:
            report.append(f"row {line} {name}: " + "; ".join(guesses))

    systems = [
        {
            "id": i,
            "name": n,
            "generation": g,
            "native": {"w": w, "h": h},
            "aspectRatio": a,
            "dualScreen": d,
            "sortOrder": k + 1,
        }
        for k, (i, n, g, w, h, a, d, _t) in enumerate(SYSTEMS)
    ]
    # The spreadsheet is the whole catalog, so consoles deleted from it are deleted from the database too
    return {
        "removeDevicesNotListed": True,
        "systems": systems,
        "devices": devices,
        "pricePoints": price_points,
        "pairs": [],
    }, report


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx", type=Path)
    ap.add_argument(
        "-o", "--out", type=Path, default=Path(__file__).resolve().parent.parent / "data" / "consoles.json"
    )
    args = ap.parse_args()

    data, report = convert(args.xlsx)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Wrote {len(data['devices'])} devices and {len(data['systems'])} systems to {args.out}")
    if report:
        print(f"\nGuesses / problems to review ({len(report)} rows):")
        for r in report:
            print("  - " + r)
    if not data["pricePoints"]:
        print("\nNo prices in the sheet: add a Price column to enable price features.")


if __name__ == "__main__":
    sys.exit(main())
