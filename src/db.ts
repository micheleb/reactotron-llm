import { Database } from 'bun:sqlite'
import type { SessionStats } from './shared/types'

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

  // Migrate: add new columns (idempotent — SQLite throws if column already exists)
  try { db.exec('ALTER TABLE sessions ADD COLUMN stats_json TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE sessions ADD COLUMN is_important INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }

  // Close orphaned sessions from previous runs
  const now = new Date().toISOString()
  db.prepare('UPDATE sessions SET disconnected_at = ? WHERE disconnected_at IS NULL').run(now)

  return db
}

const stmtCache = new WeakMap<Database, {
  insertEvent: ReturnType<Database['prepare']>
  recentEvents: ReturnType<Database['prepare']>
  getSession: ReturnType<Database['prepare']>
  getSessionFull: ReturnType<Database['prepare']>
  getMostRecentSession: ReturnType<Database['prepare']>
  sessionEventCount: ReturnType<Database['prepare']>
  listSessions: ReturnType<Database['prepare']>
  listImportantSessions: ReturnType<Database['prepare']>
  sessionEvents: ReturnType<Database['prepare']>
  sessionExists: ReturnType<Database['prepare']>
  updateStats: ReturnType<Database['prepare']>
  setBookmark: ReturnType<Database['prepare']>
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
      getSession: db.prepare(
        'SELECT id, connected_at, disconnected_at, app_name, platform, client_metadata FROM sessions WHERE id = ?',
      ),
      getSessionFull: db.prepare(
        'SELECT id, connected_at, disconnected_at, app_name, platform, client_metadata, stats_json, is_important FROM sessions WHERE id = ?',
      ),
      getMostRecentSession: db.prepare(
        'SELECT id, connected_at, disconnected_at, app_name, platform, client_metadata FROM sessions ORDER BY connected_at DESC LIMIT 1',
      ),
      sessionEventCount: db.prepare(
        'SELECT COUNT(*) as count FROM raw_events WHERE session_id = ?',
      ),
      listSessions: db.prepare(
        `SELECT s.id, s.connected_at, s.disconnected_at, s.app_name, s.platform,
                s.stats_json, s.is_important,
                COUNT(e.id) as event_count
         FROM sessions s
         LEFT JOIN raw_events e ON e.session_id = s.id
         GROUP BY s.id
         ORDER BY s.connected_at DESC`,
      ),
      listImportantSessions: db.prepare(
        `SELECT s.id, s.connected_at, s.disconnected_at, s.app_name, s.platform,
                s.stats_json, s.is_important,
                COUNT(e.id) as event_count
         FROM sessions s
         LEFT JOIN raw_events e ON e.session_id = s.id
         WHERE s.is_important = 1
         GROUP BY s.id
         ORDER BY s.connected_at DESC`,
      ),
      sessionEvents: db.prepare(
        'SELECT id, timestamp, type, raw_json FROM raw_events WHERE session_id = ? ORDER BY id ASC',
      ),
      sessionExists: db.prepare(
        'SELECT 1 FROM sessions WHERE id = ?',
      ),
      updateStats: db.prepare(
        'UPDATE sessions SET stats_json = ? WHERE id = ?',
      ),
      setBookmark: db.prepare(
        'UPDATE sessions SET is_important = ? WHERE id = ?',
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

export type SessionListRow = {
  id: string
  connected_at: string
  disconnected_at: string | null
  app_name: string | null
  platform: string | null
  event_count: number
  stats_json: string | null
  is_important: number
}

export function listSessions(db: Database, opts?: { isImportant?: boolean }): SessionListRow[] {
  if (opts?.isImportant) {
    const { listImportantSessions: stmt } = getStatements(db)
    return stmt.all() as SessionListRow[]
  }
  const { listSessions: stmt } = getStatements(db)
  return stmt.all() as SessionListRow[]
}

export function getSessionEvents(
  db: Database,
  sessionId: string,
): Array<{ id: number; timestamp: string; type: string; raw_json: string }> {
  const { sessionEvents } = getStatements(db)
  return sessionEvents.all(sessionId) as Array<{ id: number; timestamp: string; type: string; raw_json: string }>
}

export function sessionExists(db: Database, sessionId: string): boolean {
  const { sessionExists: stmt } = getStatements(db)
  return stmt.get(sessionId) !== null
}

export function deleteAllEvents(db: Database): void {
  db.exec('DELETE FROM raw_events')
  db.exec('DELETE FROM sessions')
}

export type SessionRow = {
  id: string
  connected_at: string
  disconnected_at: string | null
  app_name: string | null
  platform: string | null
  client_metadata: string | null
}

export type SessionFullRow = SessionRow & {
  stats_json: string | null
  is_important: number
}

export function getSession(db: Database, sessionId: string): SessionRow | null {
  const { getSession: stmt } = getStatements(db)
  return (stmt.get(sessionId) as SessionRow) ?? null
}

export function getSessionFull(db: Database, sessionId: string): SessionFullRow | null {
  const { getSessionFull: stmt } = getStatements(db)
  return (stmt.get(sessionId) as SessionFullRow) ?? null
}

export function getMostRecentSession(db: Database): SessionRow | null {
  const { getMostRecentSession: stmt } = getStatements(db)
  return (stmt.get() as SessionRow) ?? null
}

export function getSessionEventCount(db: Database, sessionId: string): number {
  const { sessionEventCount } = getStatements(db)
  const row = sessionEventCount.get(sessionId) as { count: number } | undefined
  return row?.count ?? 0
}

export function updateSessionStats(db: Database, sessionId: string, stats: SessionStats): void {
  const { updateStats } = getStatements(db)
  updateStats.run(JSON.stringify(stats), sessionId)
}

export function setBookmark(db: Database, sessionId: string, isImportant: boolean): void {
  const { setBookmark: stmt } = getStatements(db)
  stmt.run(isImportant ? 1 : 0, sessionId)
}

type RawEventRow = { id: number; timestamp: string; type: string; raw_json: string }

export function getFilteredEvents(
  db: Database,
  opts: { sessionId: string; types?: string[]; limit: number; offset: number },
): RawEventRow[] {
  const params: unknown[] = [opts.sessionId]
  let sql = 'SELECT id, timestamp, type, raw_json FROM raw_events WHERE session_id = ?'

  if (opts.types && opts.types.length > 0) {
    const placeholders = opts.types.map(() => '?').join(', ')
    sql += ` AND type IN (${placeholders})`
    params.push(...opts.types)
  }

  sql += ' ORDER BY id ASC LIMIT ? OFFSET ?'
  params.push(opts.limit, opts.offset)

  return db.prepare(sql).all(...params) as RawEventRow[]
}
