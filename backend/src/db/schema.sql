CREATE TABLE IF NOT EXISTS systems (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  generation   INTEGER NOT NULL,
  native_w     INTEGER NOT NULL,
  native_h     INTEGER NOT NULL,
  aspect_ratio TEXT NOT NULL,
  dual_screen  INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id                 TEXT PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  brand              TEXT NOT NULL,
  category           TEXT NOT NULL CHECK (category IN ('handheld','home')),
  form_factor        TEXT NOT NULL CHECK (form_factor IN ('vertical','horizontal','clamshell','home')),
  release_date       TEXT,
  msrp_usd           REAL,
  status             TEXT NOT NULL CHECK (status IN ('available','discontinued','upcoming')),
  popularity         INTEGER NOT NULL DEFAULT 0,
  summary            TEXT NOT NULL DEFAULT '',
  specs              TEXT NOT NULL,                -- JSON DeviceSpecs
  community_activity TEXT CHECK (community_activity IN ('very_active','active','moderate','low')),
  build_quality      INTEGER CHECK (build_quality BETWEEN 1 AND 5),
  aliases            TEXT NOT NULL DEFAULT '[]'    -- JSON string[], extra search terms
);

-- Uploaded photos. Files live in UPLOADS_DIR/devices/<device_id>/<file_name>; lowest sort_order is the cover.
CREATE TABLE IF NOT EXISTS device_images (
  id         TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  file_name  TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS device_images_device ON device_images (device_id, sort_order);

-- Brand logos, one per brand. File lives in UPLOADS_DIR/brands/<file_name>.
CREATE TABLE IF NOT EXISTS brand_logos (
  brand     TEXT PRIMARY KEY COLLATE NOCASE,
  file_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_os (
  device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  os_id       TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('stock','custom')),
  description TEXT,
  url         TEXT,
  PRIMARY KEY (device_id, os_id)
);

CREATE TABLE IF NOT EXISTS emulation_ratings (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  system_id TEXT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  rating    TEXT NOT NULL CHECK (rating IN ('great','good','playable','poor','unplayable')),
  notes     TEXT,
  PRIMARY KEY (device_id, system_id)
);

CREATE TABLE IF NOT EXISTS price_points (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  observed_at TEXT NOT NULL,   -- YYYY-MM-DD
  price_usd   REAL NOT NULL CHECK (price_usd > 0),
  condition   TEXT NOT NULL CHECK (condition IN ('new','used','refurb')),
  source      TEXT NOT NULL,
  url         TEXT
);
CREATE INDEX IF NOT EXISTS price_points_device_date ON price_points (device_id, observed_at);
-- Makes re-importing the same price file a no-op
CREATE UNIQUE INDEX IF NOT EXISTS price_points_dedupe ON price_points (device_id, observed_at, price_usd, condition, source);

CREATE TABLE IF NOT EXISTS device_pairs (
  device_id      TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  pair_device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  reason         TEXT NOT NULL,
  PRIMARY KEY (device_id, pair_device_id)
);
