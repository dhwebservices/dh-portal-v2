-- DH MDM. One row per enrolled phone, a queue of commands, and an audit log.

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,      -- sha256 of the link token; the link itself is never stored
  email TEXT NOT NULL,                  -- whose phone this is for
  name TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  downloaded_at INTEGER,                -- the profile can be downloaded once
  secret_hash TEXT                      -- sha256 of the per-phone secret baked into the profile's URLs
);

CREATE TABLE IF NOT EXISTS devices (
  udid TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL,
  email TEXT NOT NULL,
  owner_name TEXT,
  secret_hash TEXT NOT NULL,
  topic TEXT,
  push_token TEXT,                      -- hex
  push_magic TEXT,
  status TEXT NOT NULL DEFAULT 'enrolling',  -- enrolling | enrolled | removed
  enrolled_at INTEGER,
  last_seen INTEGER,
  last_push INTEGER,
  removed_at INTEGER,
  device_name TEXT,
  model TEXT,
  product TEXT,
  serial TEXT,
  os_version TEXT,
  supervised INTEGER,
  info_json TEXT,
  info_at INTEGER,
  security_json TEXT,
  security_at INTEGER,
  apps_json TEXT,
  apps_at INTEGER,
  profiles_json TEXT,                   -- health check: installed configuration profiles
  profiles_at INTEGER,
  certs_json TEXT,                      -- health check: trusted certificates
  certs_at INTEGER
);

CREATE TABLE IF NOT EXISTS commands (
  uuid TEXT PRIMARY KEY,
  udid TEXT NOT NULL,
  request_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',   -- queued | sent | done | error | notnow | cancelled
  queued_by TEXT NOT NULL,
  queued_at INTEGER NOT NULL,
  sent_at INTEGER,
  done_at INTEGER,
  result_json TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS commands_by_device ON commands (udid, status, queued_at);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  udid TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS audit_by_time ON audit (at);

