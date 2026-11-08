-- Households own profiles and paired devices. There are no user accounts in v1:
-- the parent's phone holds a "manager" token, each TV holds a "tv" token.
CREATE TABLE households (
  id          TEXT PRIMARY KEY,
  region      TEXT NOT NULL DEFAULT 'US',
  pin_hash    TEXT,
  pin_salt    TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE tokens (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('manager', 'tv')),
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL DEFAULT 'unknown',
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT
);
CREATE INDEX idx_tokens_household ON tokens(household_id, kind);

CREATE TABLE pairings (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL,
  poll_token_hash  TEXT NOT NULL,
  platform         TEXT NOT NULL,
  expires_at       TEXT NOT NULL,
  household_id     TEXT,
  device_name      TEXT,
  consumed         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_pairings_code ON pairings(code);

CREATE TABLE profiles (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  data          TEXT NOT NULL, -- JSON ProfileInput
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_profiles_household ON profiles(household_id, position);

-- Shared YouTube cache: one channel/video row serves every household (quota efficiency).
CREATE TABLE channels (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  handle                TEXT,
  thumbnail_url         TEXT NOT NULL,
  subscriber_count      INTEGER,
  uploads_playlist_id   TEXT NOT NULL,
  fetched_at            TEXT NOT NULL,
  videos_refreshed_at   TEXT,
  last_requested_at     TEXT
);
CREATE INDEX idx_channels_refresh ON channels(last_requested_at, videos_refreshed_at);

CREATE TABLE videos (
  id               TEXT PRIMARY KEY,
  channel_id       TEXT NOT NULL,
  published_at     TEXT NOT NULL,
  data             TEXT NOT NULL, -- JSON VideoMeta
  fetched_at       TEXT NOT NULL
);
CREATE INDEX idx_videos_channel ON videos(channel_id, published_at DESC);

CREATE TABLE kv_cache (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  fetched_at  TEXT NOT NULL
);

CREATE TABLE counters (
  key    TEXT PRIMARY KEY,
  value  INTEGER NOT NULL DEFAULT 0
);
