-- Base de datos de Nerf Arena (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,             -- como lo escribió (Pablo)
  name_key TEXT NOT NULL UNIQUE,  -- normalizado para buscar (pablo)
  code_hash TEXT NOT NULL,        -- SHA-256 del código de acceso
  color TEXT NOT NULL DEFAULT 'naranja',
  icon TEXT NOT NULL DEFAULT 'rayo',
  fails INTEGER NOT NULL DEFAULT 0,       -- intentos fallidos seguidos
  locked_until INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs(user_id);

-- Rivalidad entre dos jugadores: a invita, b acepta
CREATE TABLE IF NOT EXISTS rivalries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,           -- pending | active | ended
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rivalries_a ON rivalries(a);
CREATE INDEX IF NOT EXISTS rivalries_b ON rivalries(b);

-- Una guerra por rivalidad y día
CREATE TABLE IF NOT EXISTS wars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rivalry_id INTEGER NOT NULL REFERENCES rivalries(id) ON DELETE CASCADE,
  day TEXT NOT NULL,              -- AAAA-MM-DD (hora de España)
  starts INTEGER NOT NULL,        -- ms
  ends INTEGER NOT NULL,          -- ms
  status TEXT NOT NULL,           -- scheduled | live | claimed | done | expired
  hitter INTEGER,                 -- quien dio el dardo (gana el kebab)
  victim INTEGER,                 -- quien lo recibió (paga el kebab)
  claimed_by INTEGER,             -- quien dijo «le he dado» (falta que el otro confirme)
  claimed_at INTEGER,
  resolved_at INTEGER,
  paid_at INTEGER,                -- el kebab ya se ha pagado
  UNIQUE (rivalry_id, day)
);
CREATE INDEX IF NOT EXISTS wars_status ON wars(status);
