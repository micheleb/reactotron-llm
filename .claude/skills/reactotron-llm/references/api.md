# reactotron-llm-proxy — endpoint contract

Base URL `http://localhost:9090` (override with `PORT`). Read this when a call returns something you didn't expect. For what the fields on an event *mean*, see `events.md`.

The root path `GET /` returns a self-description with an `endpoints` array — **that array is incomplete** and omits every `/api/sessions*` route plus `/api/events/reset`. Trust this document, not that array.

## Contents

- [GET /health](#get-health)
- [GET /dump-state](#get-dump-state)
- [GET /api/state](#get-apistate)
- [GET /api/events](#get-apievents)
- [GET /api/sessions](#get-apisessions)
- [GET /api/sessions/:id](#get-apisessionsid)
- [PATCH /api/sessions/:id](#patch-apisessionsid)
- [GET /api/sessions/:id/events](#get-apisessionsidevents)
- [GET /api/sessions/compare](#get-apisessionscompare)
- [POST /api/events/reset](#post-apieventsreset)
- [GET /api/export](#get-apiexport)
- [WebSockets](#websockets)

---

## GET /health

```json
{ "ok": true, "port": 9090, "clients": 0, "dashboardWsPort": 9092,
  "outputDir": ".reactotron-llm", "latestStateAt": null }
```

`clients` counts apps currently attached over WebSocket. `latestStateAt` is null until some client has sent a state snapshot. `outputDir` is resolved **relative to the proxy's working directory**, which is why the proxy must be started from its repo root.

## GET /dump-state

Asks connected clients for a fresh state snapshot, sleeps 250ms, then reports. Optional `?session=<id>` scopes the request to one client.

Global form → `{ "ok": true, "clients": N, "stateFile": "...", "capturedAt": "<iso|null>" }`. Writes `state.json`.
Scoped form → `{ "ok": true, "sessionId": "...", "stateFile": "...", "capturedAt": "<iso>" }`.

Errors:

| Status | Body | When |
|---|---|---|
| 404 | `{"ok":false,"error":"Session not found or not connected"}` | `?session=` names a session that isn't a live client. Returned *before* the 250ms sleep. |
| 404 | `{"ok":false,"error":"No state captured for this session"}` | Scoped request, client never answered. |
| 404 | `{"ok":false,"error":"No state captured yet"}` | Global request, no client has ever sent state. |

Reading the snapshot is a separate call — see below.

## GET /api/state

```json
{ "ok": true, "state": { ... } }
```

Reads `state.json` **off disk**. Two consequences worth internalizing:

- It can return **200 with a stale snapshot from a previous proxy run**, long after the app that produced it went away. Always `/dump-state` first and check `capturedAt`.
- The file is overwritten whenever *any* connected client emits a state event, so with multiple clients attached it is not reliably scoped to the session you asked about.

| Status | Body |
|---|---|
| 404 | `{"ok":false,"error":"state.json not found"}` |
| 500 | `{"ok":false,"error":"<parse error>"}` — malformed file, not a missing one |

## GET /api/events

```json
{ "ok": true, "count": 50, "events": [ ... ], "hasMore": true }
```

| Param | Default | Clamp |
|---|---|---|
| `limit` | 200 | 1..2000 |
| `offset` | 0 | 0..100000 |

Two traps:

- **No session filter exists.** Events from every session come back interleaved. For investigating one app run, use `/api/sessions/:id/events`.
- **`hasMore` is computed pre-curation** as `rows.length === limit`. Curation can discard rows, so `hasMore: true` does not guarantee a non-empty next page.

Rows are fetched newest-first and reversed, so the returned page is chronological (oldest first) *within the page*.

The dashboard never calls this endpoint.

## GET /api/sessions

```json
{ "ok": true, "sessions": [
  { "id": "uuid", "connected_at": "<iso>", "disconnected_at": "<iso|null>",
    "app_name": "MyApp", "platform": "ios", "event_count": 1284,
    "is_important": false, "stats": { ... } } ] }
```

Ordered `connected_at DESC`, so `.sessions[0]` is the most recent. `disconnected_at: null` means the session is live. `event_count` includes the `client.intro` handshake event. `app_name` and `platform` come from that intro and are null until it arrives.

`?is_important=true` returns only bookmarked sessions.

Stats for **live** sessions are recomputed on every request; stats for disconnected sessions are computed once and cached. See `events.md` for the `stats` shape — and note `warning_count` is always 0 due to a bug.

## GET /api/sessions/:id

`{ "ok": true, "session": { ...same shape as a list row... } }`

404 → `{"ok":false,"error":"Session not found"}`

## PATCH /api/sessions/:id

Body `{"is_important": true}` or `{"is_important": false}` → `{"ok": true}`.

| Status | Body | When |
|---|---|---|
| 404 | `{"ok":false,"error":"Session not found"}` | Checked *before* the body is parsed |
| 400 | `{"ok":false,"error":"Invalid JSON body"}` | Unparseable JSON |
| 400 | `{"ok":false,"error":"Request body must be an object"}` | e.g. a bare string or array |
| 400 | `{"ok":false,"error":"is_important must be a boolean"}` | e.g. `"true"` or `1` |

## GET /api/sessions/:id/events

```json
{ "ok": true, "total": 1284, "events": [ ... ] }
```

The count key is **`total`**, not `count`. Returns *all* curated events for the session, chronological (oldest first). There is no `limit`, no `offset`, and no filtering — pipe into `jq`.

404 → `{"ok":false,"error":"Session not found"}`

## GET /api/sessions/compare

Requires both `a` and `b` query params.

```json
{ "ok": true,
  "sessions": { "a": { ...session... }, "b": { ...session... } },
  "by_type": { "log": { "a_count": 900, "b_count": 1200,
                        "a_events": [ ... ], "b_events": [ ... ] } } }
```

`by_type` keys are the union of event types across both sessions. **`a_count` / `b_count` are true totals, but `a_events` / `b_events` are capped at the oldest 100 events of that type.** Use the counts for magnitude; fetch `/api/sessions/:id/events` for full bodies.

| Status | Body |
|---|---|
| 400 | `{"ok":false,"error":"Both query parameters \"a\" and \"b\" are required"}` |
| 404 | `{"ok":false,"error":"Session not found: <id>"}` (names the missing one) |

Implementation note for anyone editing the server: this route must stay registered *before* `/api/sessions/:id`, or Hono matches the literal string `compare` as an `:id` and every comparison 404s.

## POST /api/events/reset

`{"ok": true}`.

**Deletes every event and every session**, not just events, and not just the current session. Irreversible. Confirm with the user before calling it.

## GET /api/export

Returns **JSONL** (`Content-Type: application/x-ndjson`), not JSON, with `Content-Disposition: attachment; filename="reactotron-export-<id8>-<YYYYMMDD-HHMMSS>.jsonl"`.

Line 1 is a header:

```json
{ "_type": "session", "session_id": "...", "app_name": "...", "platform": "...",
  "connected_at": "...", "disconnected_at": null, "exported_at": "...",
  "total_events": 1284, "exported_events": 1000, "has_more": true,
  "stats": { ... }, "filters_applied": { "type": ["log"] },
  "pagination": { "limit": 1000, "offset": 0 } }
```

Every subsequent line is one curated event, oldest first.

| Param | Default | Notes |
|---|---|---|
| `session` | most recent session | |
| `limit` | 1000 | Clamped 1..5000 — **different from `/api/events`** (1..2000) |
| `offset` | 0 | Floored at 0, no upper cap |
| `type` | all | Comma-separated, exact match, filtered in SQL on an indexed column |
| `level` | all | Comma-separated, applied **in memory after curation** |

Two behaviors that bite:

- **`level=` drops unleveled events.** `api.response` and `state.action.complete` carry no `level`. The filter keeps them only if the set literally contains `__none__`. `?level=error` therefore hides every failed network request. Use `?level=error,__none__`, or filter with `jq` instead.
- Because `level` is applied after the `limit` slice is fetched, a heavily-filtered page can come back under-full and `has_more` can be misleading. `type=` doesn't have this problem — it runs in SQL.

Two distinct 404s:

| Body | When |
|---|---|
| `{"ok":false,"error":"Session not found"}` | `?session=` names an unknown id |
| `{"ok":false,"error":"No sessions available"}` | No `?session=` and the database has no sessions at all |

## WebSockets

- `ws://localhost:9090/` (or `/ws`) — where the React Native app connects. Not for you.
- `ws://localhost:9092` — dashboard live push. Message kinds: `hello`, `clients-snapshot`, `client-connected`, `client-updated`, `client-disconnected`, `event`, `state-updated`, `events-reset`.

There is no SSE or streaming HTTP endpoint. To follow a live session from a shell, poll `/api/sessions/:id/events` and diff on `ts`.

Two things exist only on this WebSocket and have no REST equivalent: a client's `lastSeen` timestamp (which drives the dashboard's activity dot), and real-time push itself. `GET /api/sessions` plus `disconnected_at === null` is the closest REST approximation of "who is connected right now".
