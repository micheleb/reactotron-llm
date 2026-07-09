# Event and stats reference

What the fields mean. For how to fetch events, see `api.md`.

Events are stored as raw Reactotron WebSocket payloads in `.reactotron-llm/reactotron.db` (SQLite, table `raw_events`). The API *curates* them on read: it pulls the interesting fields up to a flat, predictable shape and drops the noise. Curation never renames an event's `type`, so a type string you read off an event can be passed straight back to `/api/export?type=`.

## Event shape

Every event has:

| Field | Type | Description |
|---|---|---|
| `ts` | string | ISO 8601, when the proxy received the event |
| `type` | string | Event type, verbatim from the app |

The rest appear only when relevant:

| Field | Type | Description |
|---|---|---|
| `level` | string | Log severity. See the level vocabulary below. Absent on most non-log events. |
| `message` | string | Human-readable message |
| `stack` | string | Stack trace, on errors |
| `action` | object | `{ type, name, path, displayName, payload }` for state actions. `payload` is absent when the action took no arguments. |
| `changed` | string[] | State fields an action modified. **Optional, and frequently absent** — see below. |
| `network` | object | `{ method, url, status, durationMs, requestHeaders, responseHeaders, requestBody, responseBody, error }`. Bodies may be a sentinel **string** instead of an object — guard before indexing. |
| `benchmark` | object | `{ title, steps }` |
| `details` | object | Top-level scalars from the raw event. `deltaTime` is **time since the previous command**, not a duration — see below. |

### `network.status: null` means the request failed

`network.error` is meant to hold a transport-level failure, but in practice it is never populated (0 occurrences in a 132k-event capture). What actually happens when a request gets no response — Axios `Network Error`, timeout, cancellation — is that the HTTP status is `0`, Reactotron serializes it as `"~~~ zero ~~~"`, and curation's `firstNumber` accepts only real numbers, so the status is **dropped to `null`**.

The event then carries `status: null`, `error: null`, and `responseBody: "~~~ skipped ~~~"`, with nothing marking it as a failure. `failed_network_count` computes `status >= 400 || error != ""` and so misses every one of them.

A request failed if `status >= 400`, **or** `error` is non-empty, **or** `status` is `null` on an `api.response`. In one real session that last clause was the only one that fired: 328 requests, 0 with a bad status, yet 39 genuine transport failures (240 across the whole database).

### `details.deltaTime` is not a duration

It is Reactotron's elapsed time since the *previous* command. The real action duration is `payload.ms` in the raw event, and curation never surfaces it: `extractDetails` skips the nested `payload` key, so `ms` is lost on the way out of the API.

Ranking actions by `deltaTime` gives a plausible, wrong answer. To time actions, query `raw_events.raw_json -> '$.payload.ms'` in SQLite directly; see the recipe in SKILL.md.

### `changed` is often not there

The curation code populates `changed` when the app sends it, but **mobx-state-tree apps don't send it**. A 132,577-event capture from a real MST app contained zero events with a `changed` key. Redux middleware may populate it; MST won't.

So a filter like `select((.changed // []) | index("isLoading"))` will match nothing and look like "no action ever touched that field". Check first:

```bash
curl -s "$BASE/api/sessions/$SID/events" | jq '[.events[] | select(has("changed"))] | length'
```

If that's 0, identify actions by `action.displayName` / `action.name` and inspect `action.payload` instead.

## Placeholder sentinels

Reactotron serializes values it can't represent in JSON as sentinel **strings**. These reach you undecoded — the web dashboard decodes them for display, but the HTTP API returns them raw. 126,951 of 132,577 raw events in one real capture contained at least one.

| Sentinel string | Real value |
|---|---|
| `~~~ false ~~~` | `false` |
| `~~~ true ~~~` | `true` |
| `~~~ null ~~~` | `null` |
| `~~~ undefined ~~~` | `null` (JSON has no undefined) |
| `~~~ zero ~~~` | `0` |
| `~~~ empty string ~~~` | `""` |
| `~~~ skipped ~~~` | Reactotron chose not to capture the body |
| `~~~ anonymous function ~~~`, `~~~ identity() ~~~`, `~~~ actionInitializer() ~~~`, … | a function; no JSON equivalent, left as-is |

They appear inside `details`, `action.payload`, `network.requestBody` / `responseBody`, and state snapshots from `/api/state`. They do **not** appear in log `message` strings.

Three consequences, in rough order of how often they bite:

1. **Equality tests silently fail.** Any comparison against `false`, `null`, `0`, or `""` matches nothing. In one session `select(.details.important == false)` matched 0 events; after decoding, 55,928.
2. **Numeric sorts crash.** A `deltaTime` of `0` is the string `"~~~ zero ~~~"`, and `sort_by(-.details.deltaTime)` fails with *"string cannot be negated"*. Decode first and it becomes a number.
3. **Bodies aren't always objects.** `network.requestBody` / `responseBody` are sometimes a bare sentinel string, so `.network.responseBody.data` raises *"Cannot index string with string"*. Guard with `(.network.responseBody | type) == "object"` before indexing.

Use `scripts/decode.jq` before comparing or sorting values. Note that decoding does **not** rescue `network.status` — curation already discarded that sentinel before it reached you.

## Type vocabulary

The vocabulary is **open**: whatever `type` the app emits is stored verbatim. These are the types seen in practice, with counts from a real 132k-event capture to give you a sense of proportion:

| Type | Share | What it is |
|---|---|---|
| `log` | ~82% | Console output. Carries `level` and `message`. |
| `api.response` | ~8% | A completed HTTP request/response pair. Carries `network`. |
| `state.action.complete` | ~7% | A MobX/Redux action that finished. Carries `action` and `changed`. |
| `display` | ~2% | Reactotron's custom `display()` calls. |
| `benchmark.report` | ~0.1% | A finished benchmark. Carries `benchmark`. |
| `client.intro` | one per session | The connection handshake. Supplies `app_name` and `platform`. |

Two more can appear from the proxy itself: `raw.text` (an inbound frame that wasn't JSON) and `unknown` (JSON with no `type` field).

Because matching is exact and case-sensitive, `?type=Log` matches nothing. Read the type off an event and echo it back.

### Dropped events

At ingest the proxy discards any event whose lowercased type **contains** `ping`, `pong`, `heartbeat`, or `connected`. That's a substring test, not equality — a hypothetical `shopping.cart` event would be dropped as collateral damage. These never reach the database, so they can't appear in any query or export.

`client.intro` is **not** dropped; it's stored and drives session metadata.

## Level vocabulary

| Value | Notes |
|---|---|
| `debug` | The overwhelming majority of `log` events |
| `warn` | **Not** `warning` — see the bug below |
| `error` | |
| *absent* | `api.response`, `state.action.complete`, `benchmark.report` and friends carry no level |

The dashboard offers `trace` and `info` in its filter menu as a canonical superset; real captures typically only contain `debug`, `warn`, and `error`.

When filtering server-side via `/api/export?level=`, events with **no** level are matched by the sentinel string `__none__`. Leaving it out of the filter set silently excludes every network and action event.

## Session stats

Attached to each session as `stats`, and to the export header.

| Field | Trustworthy? | Meaning |
|---|---|---|
| `version` | — | Stats schema version |
| `total_events` | yes | |
| `event_counts` | yes | Map of type → count. The fastest way to orient in an unfamiliar session. |
| `error_count` | yes | Events with `level === "error"` |
| `warning_count` | **no — always 0** | See below |
| `network_count` | yes | Events carrying a `network` object |
| `failed_network_count` | **undercounts** | Only `status >= 400` or non-empty `error`. Misses transport failures, which arrive with `status: null` — see above. Read it as a lower bound. |
| `slowest_request` | yes | `{ url, method, durationMs }` or null |
| `longest_benchmark` | yes | `{ title, totalMs }` or null |
| `latency` | yes | `{ p50, p90, p95, p99 }` over request durations, or null when there were no requests |

`slowest_request`, `longest_benchmark`, and `latency` are `null` — not zero, not absent — when the session contained nothing to measure. Guard for it: `.stats.latency.p95` on a session with no network calls yields `null`, and arithmetic on it errors in `jq`.

### The `warning_count` bug

`computeSessionStats` increments the warning counter on `event.level === 'warning'`, but events carry `'warn'`. The comparison never matches, so **`warning_count` reports 0 no matter how many warnings the app logged**. In one real capture: 1,382 `warn` events, `warning_count: 0`.

The dashboard renders this field in the session detail and comparison views, so it shows 0 there too. Don't read that as "no warnings". Count them yourself:

```bash
curl -s "$BASE/api/sessions/$SID/events" | jq '[.events[] | select(.level == "warn")] | length'
```

`error_count` compares against `'error'`, which is the real string, and is correct.

## Examples

### `log`

```json
{ "ts": "2026-03-03T07:05:43.369Z", "type": "log", "level": "debug",
  "message": "[debug] no cast info", "details": { "important": false } }
```

### `api.response`

```json
{ "ts": "2026-03-03T07:05:44.439Z", "type": "api.response",
  "network": { "method": "POST", "url": "https://example.com/api/endpoint",
    "status": 200, "durationMs": 185.14,
    "requestHeaders": {}, "responseHeaders": {},
    "requestBody": {}, "responseBody": {}, "error": null } }
```

Note the absent `level` — this is the event that `?level=error` throws away.

### `state.action.complete`

A real one, copied verbatim from a capture — note there is no `changed` key and no `action.payload`, and that `important` is a sentinel string rather than the boolean it looks like:

```json
{ "ts": "2026-06-25T15:36:44.194Z", "type": "state.action.complete",
  "action": { "name": "hydrateFromLocalStorage", "path": "/ageGateStore",
    "displayName": "ageGateStore.hydrateFromLocalStorage()" },
  "details": { "type": "state.action.complete", "important": "~~~ false ~~~",
    "date": "2026-06-25T15:36:43.453Z", "deltaTime": 613 } }
```

`details.deltaTime` (613) is the gap since the previous command, **not** how long this action took. The action's real duration — `payload.ms` — is absent from the curated event entirely. To rank actions by cost, query SQLite.
