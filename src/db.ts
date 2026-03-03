import { Database } from 'bun:sqlite'

export function initDb(dbPath: string): Database {
  const db = new Database(dbPath, { create: true })

  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      connected_at TEXT NOT NULL,
      disconnected_at TEXT,
      app_name TEXT,
      platform TEXT,
      client_metadata TEXT
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      raw_json TEXT NOT NULL
    )
  `)

  db.exec('CREATE INDEX IF NOT EXISTS idx_events_timestamp ON raw_events(timestamp)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_session ON raw_events(session_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_type ON raw_events(type)')

  // Close orphaned sessions from previous runs
  const now = new Date().toISOString()
  db.prepare('UPDATE sessions SET disconnected_at = ? WHERE disconnected_at IS NULL').run(now)

  return db
}

const stmtCache = new WeakMap<Database, {
  insertEvent: ReturnType<Database['prepare']>
  recentEvents: ReturnType<Database['prepare']>
}>()

function getStatements(db: Database) {
  let cached = stmtCache.get(db)
  if (!cached) {
    cached = {
      insertEvent: db.prepare(
        'INSERT INTO raw_events (session_id, timestamp, type, raw_json) VALUES (?, ?, ?, ?)',
      ),
      recentEvents: db.prepare(
        'SELECT id, timestamp, type, raw_json FROM raw_events ORDER BY id DESC LIMIT ? OFFSET ?',
      ),
    }
    stmtCache.set(db, cached)
  }
  return cached
}

export function createSession(db: Database, sessionId: string): void {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO sessions (id, connected_at) VALUES (?, ?)').run(sessionId, now)
}

export function updateSessionMetadata(
  db: Database,
  sessionId: string,
  metadata: { appName?: string; platform?: string; raw?: unknown },
): void {
  db.prepare(
    'UPDATE sessions SET app_name = ?, platform = ?, client_metadata = ? WHERE id = ?',
  ).run(
    metadata.appName ?? null,
    metadata.platform ?? null,
    metadata.raw ? JSON.stringify(metadata.raw) : null,
    sessionId,
  )
}

export function closeSession(db: Database, sessionId: string): void {
  const now = new Date().toISOString()
  db.prepare('UPDATE sessions SET disconnected_at = ? WHERE id = ?').run(now, sessionId)
}

export function insertRawEvent(
  db: Database,
  event: { sessionId: string; timestamp: string; type: string; rawJson: string },
): void {
  const { insertEvent } = getStatements(db)
  insertEvent.run(event.sessionId, event.timestamp, event.type, event.rawJson)
}

export function getRecentEvents(
  db: Database,
  limit: number,
  offset = 0,
): Array<{ id: number; timestamp: string; type: string; raw_json: string }> {
  const { recentEvents } = getStatements(db)
  return recentEvents.all(limit, offset) as Array<{ id: number; timestamp: string; type: string; raw_json: string }>
}

export function deleteAllEvents(db: Database): void {
  db.exec('DELETE FROM raw_events')
}
