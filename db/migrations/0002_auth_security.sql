-- 0002_auth_security.sql — brute-force protection for sign-in and PIN quick-switch.
-- A throttle row per identity (username or pin:userId). Append-only migration.

CREATE TABLE IF NOT EXISTS login_throttle (
  ident         TEXT PRIMARY KEY,   -- lowercased username, or 'pin:<userId>'
  fail_count    INTEGER NOT NULL DEFAULT 0,
  first_fail_at TEXT,               -- ISO time of the first failure in the current window
  locked_until  TEXT                -- ISO time the lock expires, or NULL
);
