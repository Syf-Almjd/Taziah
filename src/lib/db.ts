import Database from "better-sqlite3";
import path from "path";

declare global {
  // eslint-disable-next-line no-var
  var db: Database.Database | undefined;
}

const dbPath = path.resolve(process.cwd(), "taziah.db");

export const db = globalThis.db || new Database(dbPath);

if (process.env.NODE_ENV !== "production") {
  globalThis.db = db;
}

// Initialize tables on load
db.exec(`
  CREATE TABLE IF NOT EXISTS condolences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    approved INTEGER DEFAULT 1 -- Approved is default 1 (true) for simple deploy
  );

  CREATE TABLE IF NOT EXISTS track_stats (
    track_id TEXT PRIMARY KEY,
    plays INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0
  );
`);
