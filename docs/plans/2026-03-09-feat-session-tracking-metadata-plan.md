---
title: "Session Tracking & Metadata"
type: feat
date: 2026-03-09
brainstorm: docs/brainstorms/2026-03-09-session-tracking-metadata-brainstorm.md
issue: https://github.com/micheleb/reactotron-llm/issues/3
---

# Session Tracking & Metadata

## Overview

Enrich the existing session infrastructure with three capabilities, built incrementally:

1. **Summary stats** — Per-session metrics (event counts by type, errors, network failures, latencies, benchmarks) with hybrid computation (cached on disconnect, on-the-fly for active sessions)
2. **Session bookmarking** — Simple star/flag toggle (`is_important` boolean) with API and UI support
3. **Session comparison** — Side-by-side view of two sessions aligned by event type

## Problem Statement

Sessions exist in the database but are opaque — every session row looks the same in the session tree (just timestamps, app name, and total event count). Developers and LLM agents cannot quickly determine which sessions are worth investigating without opening each one and manually scanning events. There is no way to flag important sessions or compare two sessions to spot regressions.

## Proposed Solution

### Architecture

The solution follows the existing **raw-first** pattern: stats are derived from `raw_events` at read time, then cached in a `stats_json` TEXT column on the `sessions` table when a session disconnects.

```
                    ┌─────────────────────────────┐
                    │         sessions table       │
                    │  + stats_json TEXT            │
                    │  + is_important INTEGER (0/1) │
                    └─────────────────────────────┘
                              ▲
              ┌───────────────┼───────────────┐
              │               │               │
        On disconnect    On API read     On PATCH
        (materialize     (lazy backfill   (bookmark
         stats)          if NULL)          toggle)
              │               │               │
              ▼               ▼               ▼
    computeSessionStats()  computeSessionStats()  update is_important
    from raw_events        from raw_events
```

### SessionStats Type

```typescript
// src/shared/types.ts

export type SessionStats = {
  version: 1
  total_events: number
  event_counts: Record<string, number>   // e.g. { "log": 42, "state.action.complete": 15 }
  error_count: number                     // events with level === "error"
  warning_count: number                   // events with level === "warning"
  failed_network_count: number            // status >= 400 OR error field present
  network_count: number                   // total network events
  slowest_request: {                      // nullable — omitted if no network events
    url: string
    method: string
    durationMs: number
  } | null
  longest_benchmark: {                    // nullable — omitted if no benchmarks
    title: string
    totalMs: number
  } | null
  latency: {                              // nullable — omitted if fewer than 2 network events
    p50: number
    p90: number
    p95: number
    p99: number
  } | null
}
```

The `version: 1` field allows future schema evolution. If the version in a cached `stats_json` doesn't match the current version, the stats are recomputed.

### Failed Network Request Definition

A network event is "failed" if:
- `network.status >= 400`, OR
- `network.error` is a non-empty string

### Benchmark Duration Extraction

Reactotron benchmark payloads store timing in the `steps` array. Each step typically has a `delta` (ms since previous step) or `time` field. The total duration is computed as:
1. Sum of all `delta` values in the steps array, OR
2. The last step's `time` value if `delta` is not present

If steps cannot be parsed for timing, the benchmark is excluded from stats.

### API Surface

#### New endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/sessions/:id` | Single session with metadata + stats |
| `PATCH` | `/api/sessions/:id` | Update bookmark status |
| `GET` | `/api/sessions/compare` | Compare two sessions |

#### Modified endpoints

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/api/sessions` | Add `stats` and `is_important` to each session object. Add `?is_important=true` filter param |
| `GET` | `/api/export` | Add `stats` field to JSONL session header line |

#### Endpoint details

**`GET /api/sessions/:id`**
```json
{
  "ok": true,
  "session": {
    "id": "uuid",
    "connected_at": "2026-03-09T10:00:00Z",
    "disconnected_at": "2026-03-09T10:30:00Z",
    "app_name": "MyApp",
    "platform": "ios",
    "is_important": false,
    "stats": { /* SessionStats */ }
  }
}
```

For active sessions (no `disconnected_at`), stats are computed on-the-fly. For completed sessions, stats are returned from `stats_json` (or computed lazily if NULL and written back to DB).

**`PATCH /api/sessions/:id`**
```json
// Request
{ "is_important": true }

// Response (200)
{ "ok": true }

// Response (404)
{ "ok": false, "error": "Session not found" }
```

Only `is_important` is accepted. Unknown fields are ignored. Non-boolean `is_important` returns 400.

**`GET /api/sessions/compare?a=<id>&b=<id>`**
```json
{
  "ok": true,
  "sessions": {
    "a": { "id": "...", "app_name": "...", "stats": { /* SessionStats */ } },
    "b": { "id": "...", "app_name": "...", "stats": { /* SessionStats */ } }
  },
  "by_type": {
    "log": {
      "a_count": 42,
      "b_count": 38,
      "a_events": [ /* CuratedEvent[] */ ],
      "b_events": [ /* CuratedEvent[] */ ]
    },
    "state.action.complete": { ... }
  }
}
```

Returns 404 if either session ID is invalid. Active sessions are supported (stats computed on-the-fly). Event lists per type are capped at 100 events each to keep responses manageable.

**`GET /api/sessions` changes**
```json
{
  "ok": true,
  "sessions": [
    {
      "id": "uuid",
      "connected_at": "...",
      "disconnected_at": "...",
      "app_name": "MyApp",
      "platform": "ios",
      "event_count": 156,
      "is_important": false,
      "stats": { /* SessionStats */ }
    }
  ]
}
```

New query parameter: `?is_important=true` filters to bookmarked sessions only.

### Database Migration

Two new columns added to `sessions` via `ALTER TABLE`:

```sql
ALTER TABLE sessions ADD COLUMN stats_json TEXT;
ALTER TABLE sessions ADD COLUMN is_important INTEGER NOT NULL DEFAULT 0;
```

**Migration strategy:** Execute `ALTER TABLE ADD COLUMN` statements in `initDb()` after the `CREATE TABLE IF NOT EXISTS` block, wrapped in try-catch (SQLite throws if column already exists). This is idempotent and works for both fresh and existing databases.

**Stats backfill strategy:** Lazy computation. When a completed session's `stats_json` is NULL (or has an outdated `version`), compute stats on read and write the result back. No eager backfill on startup — this avoids slow startups on databases with many sessions.

**Orphaned sessions:** The existing orphan cleanup at startup (`UPDATE sessions SET disconnected_at = ? WHERE disconnected_at IS NULL`) does NOT compute stats. Stats for orphaned sessions will be lazily computed on first access, same as other backfilled sessions.

**Event reset handling:** When `POST /api/events/reset` clears `raw_events`, also set `stats_json = NULL` for all sessions so stale cached stats are invalidated.

### UI Changes

#### SessionTree.tsx — Stats badges and bookmark toggle

Each session row gains:
- **Star icon** (right side): outlined when not bookmarked, filled yellow when bookmarked. Clicking toggles via `PATCH /api/sessions/:id`. Optimistic UI update with rollback on error.
- **Error badge** (red): shown if `stats.error_count > 0`, displays count
- **Network failure badge** (orange): shown if `stats.failed_network_count > 0`, displays count
- **"Bookmarked only" toggle**: added above the session tree, filters the list client-side (backed by `?is_important=true` API filter for efficiency)

The `Session` type in SessionTree gains `is_important: boolean` and `stats: SessionStats | null`.

#### SessionDetail.tsx — Stats panel

A new stats summary section in the session header, below the existing metadata:
- **Stats cards row**: Total events, Errors, Warnings, Network requests, Failed requests
- **Expandable details**: Event counts by type (bar chart or list), Slowest request (URL + duration), Longest benchmark (title + duration), Latency percentiles (p50/p90/p95/p99)
- **Star/bookmark toggle** in the header (same behavior as tree)

No auto-refresh for active sessions — user manually refreshes. This keeps implementation simple.

#### New: SessionCompare.tsx — Comparison view

New `ViewState` variant:
```typescript
type ViewState =
  | { tab: 'live' }
  | { tab: 'history'; view: 'list' }
  | { tab: 'history'; view: 'session'; sessionId: string }
  | { tab: 'history'; view: 'compare'; sessionA: string; sessionB: string }
```

**Entry points:**
1. **From session tree**: Checkboxes appear on each session row. When exactly 2 are checked, a "Compare" button enables at the top of the tree.
2. **From session detail**: A "Compare with..." button opens a session picker modal (reusing the SessionTree component in selection mode).

**Layout:**
- **Header**: Session A metadata | Session B metadata (side by side)
- **Stats comparison**: Key metrics in two columns with delta indicators (e.g., "+5 errors" in red if B has more)
- **Event type groups**: Expandable sections, one per event type. Each section shows count for A and B, with event lists in two columns. Types present in only one session are shown with a "—" placeholder in the other column.

### ViewState Navigation Diagram

```
┌─────────┐     ┌──────────────┐     ┌────────────────┐
│  Live    │ ──► │  History      │ ──► │ Session Detail  │
│  tab     │ ◄── │  (list)       │ ◄── │                 │
└─────────┘     │               │     │ "Compare with…" │
                │  [✓] Session A │     └────────┬────────┘
                │  [✓] Session B │              │
                │  [Compare]     │              │
                └───────┬───────┘              │
                        │                      │
                        ▼                      ▼
                ┌──────────────────────────────┐
                │     Session Compare           │
                │  Session A  │  Session B      │
                │  stats      │  stats          │
                │  events     │  events         │
                └──────────────────────────────┘
```

## Implementation Phases

### Phase 1: Stats Infrastructure (Foundation)

**Files to modify:**
- `src/shared/types.ts` — Add `SessionStats` type
- `src/shared/curate.ts` — Add `computeSessionStats()` function (operates on `CuratedEvent[]`)
- `src/db.ts` — Schema migration (2 new columns), new DB functions (`updateSessionStats`, `getSessionWithStats`, `setBookmark`, `invalidateAllStats`), update `listSessions` to include new columns
- `src/index.ts` — Compute + cache stats in `onClose` handler, lazy backfill in session read paths

**New DB functions:**
```
updateSessionStats(db, sessionId, stats: SessionStats)  → UPDATE stats_json
getSessionById(db, sessionId)                           → SELECT * including stats_json, is_important
setBookmark(db, sessionId, isImportant: boolean)        → UPDATE is_important
invalidateAllStats(db)                                  → UPDATE stats_json = NULL (for event reset)
```

**Updated DB functions:**
```
listSessions(db, opts?: { isImportant?: boolean })      → Add stats_json, is_important to SELECT; optional WHERE filter
closeSession(db, sessionId)                             → After setting disconnected_at, compute and cache stats
```

**Acceptance criteria:**
- [x]`SessionStats` type defined in `src/shared/types.ts`
- [x]`computeSessionStats()` correctly computes all stat fields from a `CuratedEvent[]` array
- [x]Schema migration adds `stats_json` and `is_important` columns idempotently
- [x]Stats are materialized on session disconnect
- [x]Stats are lazily computed for sessions with NULL `stats_json` on read
- [x]Stats version mismatch triggers recomputation
- [x]`POST /api/events/reset` invalidates all cached stats

### Phase 2: API Endpoints

**Files to modify:**
- `src/index.ts` — Add `GET /api/sessions/:id`, `PATCH /api/sessions/:id`, update `GET /api/sessions` with filter and stats, update export header

**Acceptance criteria:**
- [x]`GET /api/sessions/:id` returns session with stats (cached or on-the-fly)
- [x]`PATCH /api/sessions/:id` toggles `is_important`, returns 404 for missing sessions, validates input
- [x]`GET /api/sessions` includes `stats` and `is_important` per session
- [x]`GET /api/sessions?is_important=true` filters correctly
- [x]`GET /api/export` JSONL header includes stats
- [x]All new endpoints return proper error responses (400, 404)

### Phase 3: Dashboard — Stats & Bookmarking

**Files to modify:**
- `dashboard/src/components/SessionTree.tsx` — Add star toggle, error/network badges, "bookmarked only" filter
- `dashboard/src/components/SessionDetail.tsx` — Add stats panel in header, star toggle
- `dashboard/src/App.tsx` — Update `Session` type references

**Acceptance criteria:**
- [x]Session tree shows error and network failure count badges
- [x]Star icon toggles bookmark via PATCH, with optimistic update
- [x]"Bookmarked only" filter works in session tree
- [x]Session detail shows stats panel (cards + expandable details)
- [x]Star toggle works from both tree and detail views

### Phase 4: Session Comparison

**Files to modify:**
- `src/index.ts` — Add `GET /api/sessions/compare` endpoint
- `dashboard/src/components/SessionCompare.tsx` — New component
- `dashboard/src/components/SessionTree.tsx` — Add checkbox multi-select mode + Compare button
- `dashboard/src/components/SessionDetail.tsx` — Add "Compare with..." button
- `dashboard/src/App.tsx` — Add `compare` ViewState variant, route to SessionCompare

**Acceptance criteria:**
- [x]`GET /api/sessions/compare?a=X&b=Y` returns grouped comparison data
- [x]Selecting 2 sessions in the tree enables Compare button
- [x]"Compare with..." from session detail opens session picker
- [x]Comparison view shows side-by-side stats with delta indicators
- [x]Event type groups show events from both sessions
- [x]Types present in only one session show placeholder in the other column
- [x]404 returned if either session ID is invalid

### Phase 5: Tests

**Files to modify:**
- `tests/sessions.spec.ts` — New test file for session stats, bookmarking, and comparison API endpoints
- `tests/dashboard.spec.ts` — Add tests for stats badges, bookmark toggle, comparison UI flow

**Acceptance criteria:**
- [x]Stats computation tested with various event mixes (errors, network, benchmarks, empty sessions)
- [x]Bookmark toggle API tested (set, unset, 404, invalid input)
- [x]Comparison endpoint tested (valid pair, invalid IDs, empty sessions)
- [x]Lazy backfill tested (session with NULL stats_json gets computed on read)
- [x]Event reset invalidates stats
- [x]Dashboard tests cover bookmark toggle, stats display, comparison navigation

## Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stats computation slow for large sessions | Slow API responses | Lazy caching ensures each session is computed at most once. Active sessions with many events may be slow but this is a dev tool, not production. |
| Benchmark steps format varies | Missing benchmark stats | Graceful fallback: if steps can't be parsed, `longest_benchmark` is null |
| Schema migration on existing databases | Data loss | `ALTER TABLE ADD COLUMN` is non-destructive. No data is removed. Wrapped in try-catch for idempotency. |
| Comparison view with very large sessions | UI performance | Event lists per type capped at 100 in API response. react-virtuoso for rendering. |
| Race condition: late events after disconnect | Slightly inaccurate stats | Acceptable for a dev tool. Stats can be manually recomputed by re-accessing the session. |

## References

### Internal Files
- `src/db.ts` — Database schema and all session DB functions
- `src/index.ts` — API routes and WebSocket handlers
- `src/shared/types.ts` — `CuratedEvent` type (lines 1-33)
- `src/shared/curate.ts` — Event curation pipeline, benchmark handling (lines 515-520)
- `dashboard/src/components/SessionTree.tsx` — Session browser component
- `dashboard/src/components/SessionDetail.tsx` — Session detail viewer
- `dashboard/src/App.tsx` — ViewState machine (lines 44-47)

### Related Documents
- Brainstorm: `docs/brainstorms/2026-03-09-session-tracking-metadata-brainstorm.md`
- Issue: https://github.com/micheleb/reactotron-llm/issues/3
