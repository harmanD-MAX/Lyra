-- Lyra accounts database (Cloudflare D1).
-- The backend also creates these tables on startup; this file is for
--   npx wrangler d1 execute lyra-db --remote --file=cloudflare/schema.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,            -- Google account "sub"
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS songs (
  job_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  cloud_url TEXT,                 -- Master 3D in R2
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_songs_user ON songs(user_id, created_at DESC);
