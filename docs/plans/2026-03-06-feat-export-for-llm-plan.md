---
title: "feat: Export curated events as JSONL for LLM consumption"
type: feat
date: 2026-03-06
brainstorm: docs/brainstorms/2026-03-06-export-for-llm-brainstorm.md
issue: https://github.com/micheleb/reactotron-llm/issues/6
---

# Export Curated Events as JSONL for LLM Consumption

## Overview

Add a `GET /api/export` endpoint and a dashboard Export button that downloads curated Reactotron events as a JSONL file optimized for LLM agents. The file includes a session metadata header line followed by filtered `CuratedEvent` objects — ready to be shared with colleagues or fed to an agent for debugging.

## Problem Statement / Motivation

Developers using Reactotron-LLM can see live events in the dashboard and query them via the API, but there is no way to package a filtered set of events into a portable file for offline analysis. LLM agents need a self-contained artifact with session context to reason about app behavior. The export bridges this gap: one click produces a file an agent can consume directly.

## Proposed Solution

### Architecture

```
Dashboard (Export button)
  ↓ constructs URL from current filter state
  ↓ window.open() or <a download>
GET /api/export?type=log&level=error&limit=1000&session=abc-123
  ↓
Server (src/index.ts)
  ├─ getSession() or getMostRecentSession()     ← new DB functions
  ├─ getFilteredEvents(sessionId, types, limit, offset)  ← new DB function
  ├─ curateEvent() each row → filter by level post-curation
  ├─ Build JSONL: session header + event lines
  └─ Return with Content-Type: application/x-ndjson
       + Content-Disposition: attachment
```

### JSONL Format

First line — session metadata envelope:
```json
{"_type":"session","session_id":"abc-123","app_name":"MyApp","platform":"ios","connected_at":"2026-03-06T10:00:00Z","disconnected_at":"2026-03-06T10:30:00Z","exported_at":"2026-03-06T11:00:00Z","total_events":500,"exported_events":42,"has_more":false,"filters_applied":{"type":["log"],"level":"error"},"pagination":{"limit":1000,"offset":0}}
```

Subsequent lines — `CuratedEvent` objects (one per line, existing type unchanged):
```json
{"ts":"2026-03-06T10:01:00Z","type":"log","level":"error","message":"Network timeout on /api/users"}
```

### API Endpoint

```
GET /api/export?type=log,api.response&level=error&limit=1000&offset=0&session=abc-123
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string (comma-separated) | _(all types)_ | Event types to include |
| `level` | string | _(all levels)_ | Filter by log level: debug, info, warn, error |
| `limit` | number | 1000 | Max curated events to return (1–5000) |
| `offset` | number | 0 | Pagination offset into the curated+filtered result set |
| `session` | string (UUID) | _(most recent)_ | Session ID; defaults to the most recently connected session |

**Success response** (200):
- `Content-Type: application/x-ndjson`
- `Content-Disposition: attachment; filename="reactotron-export-abc12345-20260306-103045.jsonl"`

**Error responses** (400/404) — standard JSON, consistent with existing API:
- `Content-Type: application/json`
- `{ "ok": false, "error": "Session not found" }`

### Session Header Fields

| Field | Description |
|-------|-------------|
| `_type` | Always `"session"` — discriminator for parsers |
| `session_id` | Full session UUID |
| `app_name` | From client.intro (may be null if no intro received) |
| `platform` | From client.intro (may be null) |
| `connected_at` | ISO 8601 |
| `disconnected_at` | ISO 8601 or null if session is still active |
| `exported_at` | ISO 8601 — when this export was generated |
| `total_events` | Total raw events in this session (before filtering) |
| `exported_events` | Number of curated event lines in this response |
| `has_more` | Boolean — whether more events exist beyond this page |
| `filters_applied` | Object echoing the filter params used |
| `pagination` | Object with `limit` and `offset` used |

### Filename Convention

```
reactotron-export-{session_id_first_8}-{YYYYMMDD-HHmmss}.jsonl
```

Example: `reactotron-export-abc12345-20260306-103045.jsonl`

## Technical Considerations

### Level filtering is post-curation

The `level` field is not a column in `raw_events` — it is extracted by `curateEvent()` from the JSON payload. Server-side level filtering must:
1. Fetch raw rows from SQLite (filtered by `type` and `session_id` where those are DB columns)
2. Curate each row via `curateEvent()`
3. Apply level filter on the curated result
4. Apply limit/offset on the filtered set

This means the server may scan more rows than `limit` to fill a page. For typical debugging sessions (< 50K events), this is acceptable. If it becomes a bottleneck, a `level` column can be added to `raw_events` later.

### Type filtering uses the DB index

The `type` column in `raw_events` is indexed (`idx_events_type`). The stored type matches what `curateEvent()` produces (both use `getMessageType()`), so `WHERE type IN (...)` in SQL is safe and efficient.

### Dashboard download mechanism

The dashboard runs on a separate Vite dev port (cross-origin). To trigger a browser download:
- Construct the full export URL from `apiBase` + query params from current filter state
- Use a dynamically created `<a>` element with the `href` set to the export URL and click it programmatically, or use `window.open(url)`
- CORS is already enabled on `/api/*`, and the server sets `Content-Disposition: attachment` which tells the browser to download

### Events that curate to null

`curateEvent()` returns `null` for events with no useful fields. These are silently skipped (same as existing `/api/events`). The `exported_events` count in the header reflects only the events actually written to the JSONL output.

### Zero-event exports

If no events match the filters, the server still returns a 200 with just the session header line (containing `exported_events: 0`). The dashboard could optionally show a toast, but the file is still valid JSONL.

### Buffered response (not streamed)

Build the full JSONL string in memory before responding. At max 5000 curated events, the response size is manageable. Streaming can be added later if needed.

## Acceptance Criteria

- [x] New `getSession(db, sessionId)` function in `src/db.ts`
- [x] New `getMostRecentSession(db)` function in `src/db.ts`
- [x] New `getFilteredEvents(db, { sessionId, types?, limit, offset })` function in `src/db.ts` with prepared statements
- [x] New `getSessionEventCount(db, sessionId)` function in `src/db.ts` for `total_events`
- [x] `GET /api/export` endpoint in `src/index.ts` with all query params
- [x] Session metadata header line with all fields from the spec
- [x] CuratedEvent lines match existing `curateEvent()` output
- [x] `Content-Type: application/x-ndjson` and `Content-Disposition: attachment` headers
- [x] Error responses (400/404) return JSON with `{ ok: false, error }`
- [x] Limit clamped to [1, 5000], offset clamped to [0, ∞), invalid params return defaults
- [x] Export button in dashboard header bar (alongside existing action buttons)
- [x] Export button passes current `typeFilter` and `levelFilter` as query params
- [x] `errorsOnly` checkbox maps to `level=error` in export URL
- [x] Export button disabled when no events are loaded
- [x] Filename follows `reactotron-export-{id8}-{timestamp}.jsonl` convention

## Implementation Phases

### Phase 1: DB Layer (`src/db.ts`)

Add four new functions with cached prepared statements:

**`src/db.ts` — new prepared statements:**

```typescript
// Add to the stmtCache shape:
getSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
getMostRecentSession: db.prepare('SELECT * FROM sessions ORDER BY connected_at DESC LIMIT 1'),
sessionEventCount: db.prepare('SELECT COUNT(*) as count FROM raw_events WHERE session_id = ?'),
// For filtered events — see dynamic query note below
```

**`getSession(db, sessionId)`** — returns session row or null.

**`getMostRecentSession(db)`** — returns the most recently connected session.

**`getSessionEventCount(db, sessionId)`** — returns total raw event count for the session.

**`getFilteredEvents(db, opts)`** — queries `raw_events` with:
- `WHERE session_id = ?`
- Optional `AND type IN (?, ?, ...)` when `types` array is provided
- `ORDER BY id ASC` (chronological for export)
- `LIMIT ? OFFSET ?`

Note: since the number of `type` values varies, this query cannot be a single prepared statement. Build the SQL string with parameterized placeholders (`?`) dynamically, but do NOT interpolate user values into the SQL string.

### Phase 2: API Endpoint (`src/index.ts`)

Add `GET /api/export` route:

```typescript
app.get('/api/export', (c) => {
  // 1. Parse & validate query params (type, level, limit, offset, session)
  // 2. Resolve session: getSession(db, sessionId) or getMostRecentSession(db)
  //    → 404 if not found
  // 3. Get total event count for session (for header)
  // 4. Fetch filtered raw rows via getFilteredEvents()
  // 5. Curate each row, apply level filter post-curation
  // 6. Build JSONL: session header line + event lines
  // 7. Determine has_more (fetch limit+1 rows, or compare counts)
  // 8. Set response headers and return body
})
```

**has_more detection**: fetch `limit + 1` rows. If we get more than `limit` curated events after filtering, `has_more = true` and we return only `limit` events. This avoids a separate COUNT query.

### Phase 3: Dashboard Export Button (`dashboard/src/App.tsx`)

Add an Export button in the header `HStack` alongside existing action buttons:

```tsx
<Button
  size="sm"
  colorScheme="blue"
  isDisabled={events.length === 0}
  onClick={() => {
    const params = new URLSearchParams()
    if (typeFilter) params.set('type', typeFilter)
    if (levelFilter) params.set('level', levelFilter)
    if (errorsOnly && !levelFilter) params.set('level', 'error')
    const url = `${apiBase}/api/export?${params.toString()}`
    window.open(url)
  }}
>
  Export
</Button>
```

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Level filtering requires full table scan | Acceptable at expected data volumes; add `level` column later if needed |
| Dynamic SQL for type IN clause | Use parameterized placeholders, never interpolate values |
| Cross-origin download may not trigger in all browsers | Test with `window.open()` and fall back to `<a download>` if needed |
| Session metadata may be incomplete (no client.intro received) | Handle null `app_name`/`platform` gracefully — still export events |
| `feat/load-more-events` branch has offset support not yet merged | Export builds its own query function with offset; no dependency on that branch |

## Decisions Made (Resolving Brainstorm Open Questions)

1. **Raw JSON alongside curated events?** → No, not in v1. Curated-only keeps exports compact and token-efficient. Can add `include_raw=true` param later.
2. **Max export size limit?** → 5000-event cap via `limit` param. No byte-size limit for v1. Sufficient guard for debugging sessions.
3. **File naming?** → `reactotron-export-{session_id_first_8}-{YYYYMMDD-HHmmss}.jsonl`. Compact, unique, sortable by date.

## References

- Brainstorm: [`docs/brainstorms/2026-03-06-export-for-llm-brainstorm.md`](../brainstorms/2026-03-06-export-for-llm-brainstorm.md)
- GitHub issue: [#6](https://github.com/micheleb/reactotron-llm/issues/6)
- Existing API routes: `src/index.ts:163-244`
- DB layer: `src/db.ts`
- Curation: `src/shared/curate.ts:396` (`curateEvent()`)
- CuratedEvent type: `src/shared/types.ts`
- Dashboard: `dashboard/src/App.tsx`
