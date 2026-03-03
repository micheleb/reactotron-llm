# Brainstorm: Migrate Storage from JSONL to SQLite

**Date:** 2026-03-03
**Issue:** [#1](https://github.com/micheleb/reactotron-llm/issues/1)
**Status:** Ready for planning

## What We're Building

Replace the JSONL flat-file storage with SQLite, adopting a **raw-first architecture**: store raw Reactotron WebSocket payloads directly into SQLite with minimal processing at ingestion time. Curation (filtering, extracting structured data) moves entirely to read-time.

The goal is to decouple write speed from curation complexity. As new Reactotron event types appear or curation logic changes, no data is lost — the raw payloads are always there to re-curate.

## Why This Approach

- **Write speed**: Ingestion does almost nothing — extract 3 fields, write a row. The app client is never blocked by curation logic.
- **Flexibility**: Raw data is preserved. If curation logic improves later, old events benefit retroactively.
- **Simplicity**: One write path (raw insert), one read path (curate on demand). No complex ingestion pipeline.
- **SQLite strengths**: WAL mode gives concurrent reads + writes. Indexed columns give fast filtering. JSON functions allow querying into blobs when needed.

## Key Decisions

### 1. Schema: Raw table + light normalized tables

Two tables:

- **`sessions`** — One row per Reactotron client connection. Tracks session lifecycle (connect/disconnect timestamps, client metadata like app name, platform).
- **`raw_events`** — One row per WebSocket message. Contains the full raw JSON payload plus three indexed columns extracted at ingestion time.

This keeps writes fast while giving sessions a natural grouping boundary.

### 2. Metadata extracted at ingestion: bare minimum

Only three columns alongside the raw JSON blob:

| Column | Purpose |
|---|---|
| `timestamp` | When the event was received |
| `session_id` | FK to sessions table |
| `type` | Message type string (e.g., `log`, `api.response`, `state.action.complete`) |

Everything else (severity level, HTTP status, action name, etc.) is derived from the JSON blob at read time. This is the raw-first principle: if it's not needed for indexing, don't extract it at write time.

### 3. SQLite driver: `bun:sqlite`

Use Bun's built-in SQLite driver. Zero additional dependencies, synchronous API, native performance. The project already requires Bun >= 1.1.0, so this is the natural choice.

### 4. Curation: shared module

Extract the existing curation logic (`curateEvent()`, path-extraction helpers, `CuratedEvent` type) into a shared module that both the server API and dashboard can import.

This solves two problems at once:
- Eliminates the current duplication of `CuratedEvent` between `src/index.ts` and `dashboard/src/App.tsx`
- Allows the dashboard to optionally curate client-side from raw data in the future

### 5. Migration: clean break

No migration of existing JSONL data. Debugging data is ephemeral and not precious. On upgrade, the system starts fresh with SQLite. Old `.reactotron-llm/app-log.jsonl` files can be ignored or manually deleted.

### 6. API contract: preserved

`GET /api/events` continues to return `CuratedEvent[]`. The server curates on-the-fly from raw SQLite data when serving API responses. This maintains backward compatibility with the Claude skill and any other consumers.

A raw endpoint (`/api/events/raw`) could be added later if needed, but is not part of the initial scope.

## SQLite Configuration

- **WAL mode** enabled for concurrent reads during writes
- **Indexes** on `raw_events(timestamp)`, `raw_events(session_id)`, `raw_events(type)`
- **DB location**: `.reactotron-llm/reactotron.db` (same directory as the current JSONL file)
- **Synchronous = NORMAL** for a balance of durability and speed (this is debugging data, not financial records)

## Open Questions

- **Should `shouldDrop()` remain at ingestion time?** Filtering out noise (ping, pong, heartbeat) before writing to SQLite would keep the database smaller. But storing everything is more "raw-first". Leaning toward still dropping pure protocol noise since it has zero debugging value.
- **Dashboard WebSocket**: Currently the dashboard gets live events via WebSocket from port 9092. Should it receive raw or curated events over the socket? Likely raw, and curate client-side, since the shared module makes this easy.
- **State snapshots**: The current `dump-state` flow writes to `.reactotron-llm/state.json`. Should state snapshots also go into SQLite (as a special event type), or remain as separate files?
