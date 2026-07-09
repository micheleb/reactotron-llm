---
name: reactotron-llm
description: >-
  Inspect and debug a running React Native app through reactotron-llm-proxy, a local
  Reactotron-compatible proxy at http://localhost:9090 that records the app's console logs,
  network requests, MobX/Redux state actions, benchmarks, and state snapshots into SQLite.
  Use this whenever you need to see what a React Native app is doing at runtime - "what is
  the app doing", "check the logs", "why did that request fail", "what API calls is the app
  making", "show me the app state", "debug the React Native app", "find the errors",
  "compare these two sessions", or "export the logs". With curl and jq it does everything
  the reactotron-llm web dashboard does - read and filter log, network, and action events,
  search requests by URL, browse, inspect, and diff sessions, capture a fresh state dump,
  and export JSONL. Reach for it whenever the user mentions Reactotron, app logs, runtime
  state, or the app's network calls, even when they never name the tool.
---

# Reactotron LLM Inspector

`reactotron-llm-proxy` is a drop-in replacement for the Reactotron desktop client. A React Native app connects to it over WebSocket and streams everything Reactotron would normally show a human: console logs, HTTP requests and responses, MobX/Redux actions, benchmarks, and state snapshots. The proxy stores the raw events in SQLite and exposes them over a small HTTP API, so you can answer questions about a running app with `curl` and `jq` instead of squinting at a GUI.

Two things to internalize before you start:

**A client and a session are the same thing.** When an app connects, the proxy mints one UUID and uses it as both the WebSocket client id and the session id. "The live client" and "the newest session" are the same row. There is no separate client identifier to hunt for.

**Everything here is read-only except two clearly marked endpoints** (bookmarking a session, and resetting the log). Reading events never changes what the app or the proxy is doing.

Set a base URL once and reuse it:

```bash
BASE=http://localhost:9090
```

The web dashboard runs on `:5173` and its live-push WebSocket on `:9092`. You don't need either.

## Start here: is the proxy up?

```bash
curl -s "$BASE/health" | jq '{ok, clients, latestStateAt}'
```

- `ok: true` — the proxy is running. Go on.
- `clients: 0` — the proxy is up but **no app is currently attached**. This is fine for reading history: every past session is still queryable. It only means you can't request a fresh state dump.
- **No response at all** — the proxy isn't running.

When the proxy isn't running, don't guess at paths and don't kill anything. Find the repo through this skill's own install location, which works on any machine that installed it as documented:

```bash
REPO=$(readlink ~/.claude/skills/reactotron-llm | sed 's#/\.claude/skills/reactotron-llm$##')
```

Then use AskUserQuestion to offer starting it, because starting the proxy forces the React Native app to reconnect and the user may not want that mid-debug. If they agree, run `bun start` **from `$REPO`** — the proxy resolves its output directory relative to the current working directory, so launching from anywhere else silently creates a fresh empty database in the wrong place and you'll be reading zero events while the real ones sit untouched.

If `readlink` yields nothing (the user copied the skill instead of symlinking it), ask them for the proxy repo path rather than searching the filesystem.

One more failure mode: if something *is* listening on 9090 but `/health` returns nothing resembling this proxy, the Reactotron **desktop app** is probably holding the port — it has no `/health` route. Say so and let the user decide. Killing a process the user didn't ask you to kill is never a routine step.

## Find the session you care about

Sessions come back newest first, so `.sessions[0]` is the most recent one.

```bash
SID=$(curl -s "$BASE/api/sessions" | jq -r '.sessions[0].id')
```

To see what's available before choosing:

```bash
curl -s "$BASE/api/sessions" | jq -r '.sessions[] |
  "\(.id[0:8])  \(.app_name // "?")/\(.platform // "?")  events=\(.event_count)  errors=\(.stats.error_count)  \(if .disconnected_at then "closed" else "LIVE" end)"'
```

A session with `disconnected_at: null` is still live. `event_count` includes the `client.intro` handshake event, so it runs one higher than the number of interesting events.

> There is also a `GET /api/events` endpoint. **Prefer `/api/sessions/:id/events` over it.** `/api/events` returns events from *all sessions mixed together* with no way to filter by session, and its `hasMore` flag is computed before curation, so it can claim there's another page when there isn't. It exists for quick global sampling; it is the wrong tool for investigating one app run.

## Read a session's events

```bash
curl -s "$BASE/api/sessions/$SID/events" | jq '.total'
```

This returns **every** curated event for the session in chronological order, with no limit or offset. The count lives under `.total`, not `.count`. Busy sessions can be large, so pipe straight into a `jq` filter rather than dumping the whole thing into context.

Each event has `ts` and `type`, plus whichever of `level`, `message`, `stack`, `network`, `action`, `changed`, `benchmark`, `details` apply. See `references/events.md` for the full shape.

## Decode the placeholder strings before comparing values

Reactotron cannot put every JavaScript value on the wire, so it replaces some primitives with sentinel **strings**: `false` arrives as `"~~~ false ~~~"`, `null` as `"~~~ null ~~~"`, `0` as `"~~~ zero ~~~"`, `""` as `"~~~ empty string ~~~"`, and `undefined` as `"~~~ undefined ~~~"`. The web dashboard quietly decodes these before displaying anything. **The HTTP API does not** — it hands you the raw strings.

This matters more than it sounds. In one real session, `select(.details.important == false)` matched **0** events, while the same filter after decoding matched **55,928**. A comparison against a boolean, a number, or an empty string will silently match nothing, and you'll conclude the app never did the thing.

A `decode` filter ships with this skill. Compose it into any `jq` program:

```bash
DECODE=$(cat ~/.claude/skills/reactotron-llm/scripts/decode.jq)

curl -s "$BASE/api/sessions/$SID/events" \
  | jq "$DECODE"' .events[] | decode | select(.details.important == false)'
```

You need this whenever you compare against values inside `details`, `action.payload`, `network.requestBody` / `responseBody`, or a state snapshot. Log `message` strings are unaffected, so the error and warning recipes below don't need it.

It bites numeric work too, which is easy to miss: a `deltaTime` of `0` arrives as `"~~~ zero ~~~"`, so `sort_by(-.details.deltaTime)` fails outright with *"string cannot be negated"*. Decode before any sort or arithmetic and the field becomes a real number.

Sentinels that have no JSON equivalent — `"~~~ anonymous function ~~~"`, `"~~~ identity() ~~~"` — are left as-is on purpose; seeing one tells you the app sent a function there.

## Errors and warnings

Filter in `jq`, not with a server-side `level` parameter:

```bash
# Errors in this session
curl -s "$BASE/api/sessions/$SID/events" \
  | jq -r '.events[] | select(.level == "error") | "\(.ts)  \(.message)"'

# Warnings — the level string is "warn", never "warning"
curl -s "$BASE/api/sessions/$SID/events" \
  | jq -r '.events[] | select(.level == "warn") | "\(.ts)  \(.message)"'
```

> **`stats.warning_count` is always 0.** The stats aggregator compares against the string `'warning'`, but the events carry `'warn'`, so the counter never increments — this is a known bug in the proxy, not a sign the app logged no warnings. Count warnings yourself with the filter above. `stats.error_count` uses the correct string and *is* trustworthy.

## Network requests

```bash
# Every failed call: HTTP >= 400, a transport error, OR no response at all.
# The last clause is the one that matters — see the warning below.
curl -s "$BASE/api/sessions/$SID/events" | jq -r '.events[]
  | select(.network)
  | select((.network.status // 0) >= 400 or (.network.error // "") != "" or .network.status == null)
  | "\(.network.status // "NO RESPONSE")  \(.network.method)  \(.network.url)  \(.network.durationMs)ms"'

# Requests whose URL contains a substring
curl -s "$BASE/api/sessions/$SID/events" | jq -r --arg u graphql '.events[]
  | select((.network.url // "") | ascii_downcase | contains($u))
  | "\(.network.status)  \(.network.method)  \(.network.url)"'

# Slowest 10 requests
curl -s "$BASE/api/sessions/$SID/events" | jq -r '[.events[] | select(.network.durationMs != null)]
  | sort_by(-.network.durationMs) | .[0:10][]
  | "\(.network.durationMs)ms  \(.network.method)  \(.network.url)"'

# Full request/response bodies for one endpoint — usually the answer to "why did that fail".
# Bodies are sometimes a sentinel STRING rather than an object, so guard before indexing.
curl -s "$BASE/api/sessions/$SID/events" | jq '.events[]
  | select((.network.url // "") | test("checkout"))
  | {url: .network.url, status: .network.status, error: .network.error,
     request: .network.requestBody, response: .network.responseBody}'
```

> **A `null` status means the request failed, not that it's uninteresting.** When a request never gets a response — Axios's `Network Error`, a timeout, a cancellation — the HTTP status is `0`, which Reactotron sends as `"~~~ zero ~~~"`. Curation only accepts real numbers there, so it discards the sentinel and leaves `network.status: null` with `network.error: null` and `responseBody: "~~~ skipped ~~~"`. Nothing marks the event as a failure. `stats.failed_network_count` misses these too, for the same reason. In one real session all 328 requests looked fine by status, yet 39 of them had failed at the transport layer — the only other trace was 39 matching `error`-level logs. Treat a status-less `api.response` as a failed call, and corroborate with the error logs.

> The dashboard's "URL contains" box, its newest/oldest sort, and its errors-only toggle are **browser-side filters with no server equivalent**. No endpoint accepts a URL, sort, or errors-only parameter. Reproduce them in `jq`, as above — don't go looking for query parameters that don't exist.

## State actions (MobX / Redux)

`state.action.complete` events identify the action via `action.displayName`, e.g. `settingsStore.loadSettingsFromAPI()`.

```bash
# Which actions ran, and how often?
curl -s "$BASE/api/sessions/$SID/events" | jq -r '[.events[]
  | select(.type == "state.action.complete") | .action.displayName]
  | group_by(.) | map({n: length, name: .[0]}) | sort_by(-.n)[]
  | "\(.n)  \(.name)"'

# Every run of one action, with its arguments
curl -s "$BASE/api/sessions/$SID/events" | jq --arg a loadSettingsFromAPI '.events[]
  | select(.type == "state.action.complete" and .action.name == $a)
  | {ts, action: .action.displayName, payload: .action.payload}'

# What kinds of events does this session even contain?
curl -s "$BASE/api/sessions/$SID" | jq '.session.stats.event_counts'
```

That last histogram is the fastest way to orient yourself in an unfamiliar session before you start filtering.

### How long did an action take? Not over HTTP.

**`details.deltaTime` is not the action's duration.** It is Reactotron's time since the *previous* command — a measure of the gap between events, not of work done. The real duration lives at `payload.ms` in the raw event, and curation drops it: the code that builds `details` deliberately skips the nested `payload` key, so `ms` never reaches the API.

Sorting by `deltaTime` therefore yields a confident, wrong answer. In one real session it crowned `stopPolling()` — a single call totalling 109ms — as the slowest action, while the true hotspot, `loadSettingsFromAPI()`, had consumed 71 seconds across 233 calls and didn't appear at all.

For timing questions, read the SQLite file directly. It's the same data the API serves, and `-readonly` guarantees you can't disturb a live capture:

```bash
REPO=$(readlink ~/.claude/skills/reactotron-llm | sed 's#/\.claude/skills/reactotron-llm$##')
DB="$REPO/.reactotron-llm/reactotron.db"

# Slowest individual action calls
sqlite3 -readonly "$DB" "
  select round(json_extract(raw_json,'\$.payload.ms'),1) as ms,
         json_extract(raw_json,'\$.payload.name') as action
  from raw_events
  where type = 'state.action.complete' and session_id = '$SID'
  order by json_extract(raw_json,'\$.payload.ms') desc limit 10;"

# Where the time actually goes: total ms per action across the session.
# Usually the better answer to "why is this screen slow" — a fast action
# called 233 times beats a slow one called once.
sqlite3 -readonly "$DB" "
  select json_extract(raw_json,'\$.payload.name') as action,
         count(*) as calls,
         round(sum(json_extract(raw_json,'\$.payload.ms')),0) as total_ms
  from raw_events
  where type = 'state.action.complete' and session_id = '$SID'
  group by 1 order by total_ms desc limit 10;"
```

The events table is `raw_events`, not `events`, and its columns are `id, session_id, timestamp, type, raw_json`.

> An event's `changed` array — the state fields an action touched — is **optional, and mobx-state-tree apps don't send it**. In a 132k-event capture from a real MST app, not one event had it. Don't build a filter around `.changed` and conclude nothing changed; check whether the field exists at all (`jq '[.events[] | select(has("changed"))] | length'`) before you rely on it. `action.payload` is likewise absent when the action took no arguments.

## Capture a state snapshot

A snapshot is pulled on demand: the proxy asks the connected app for its current store, waits briefly, and writes it to disk. So you request, then read.

```bash
curl -s "$BASE/dump-state?session=$SID" | jq '{ok, capturedAt}'
curl -s "$BASE/api/state" | jq '.state | keys'

# Reading actual values out of the snapshot: decode first
curl -s "$BASE/api/state" | jq "$DECODE"' .state | decode | .settingsStore'
```

Requesting a dump only works for a session that is **currently connected** — a closed session returns 404, because there's no app left to ask.

> `/api/state` reads a `state.json` file off disk, so it can hand you a **200 with a stale snapshot from a previous run** even when nothing was captured this session. Always trigger `/dump-state` first, and check that the `capturedAt` you get back is recent. That file is also overwritten by *any* connected client's state event, so when several apps are attached, scope your request with `?session=` and treat the result with suspicion if another client is chatty.

## Compare two sessions

Useful for "this worked yesterday" — diff a good run against a bad one.

```bash
curl -s "$BASE/api/sessions/compare?a=$S1&b=$S2" | jq '.by_type
  | to_entries
  | map({type: .key, a: .value.a_count, b: .value.b_count, delta: (.value.b_count - .value.a_count)})
  | sort_by(-(.a + .b))'

curl -s "$BASE/api/sessions/compare?a=$S1&b=$S2" | jq '{
  a: {errors: .sessions.a.stats.error_count, failed: .sessions.a.stats.failed_network_count, p95: .sessions.a.stats.latency.p95},
  b: {errors: .sessions.b.stats.error_count, failed: .sessions.b.stats.failed_network_count, p95: .sessions.b.stats.latency.p95}}'
```

> `a_count` and `b_count` are true totals, but the `a_events` / `b_events` arrays inlined next to them are **capped at the oldest 100 events per type**. Use the counts for "how much", and go back to `/api/sessions/:id/events` when you need the actual event bodies of a busy type.

## Export a session to JSONL

The first line is a session header (`_type: "session"` with metadata and stats); every line after it is one event, oldest first.

```bash
curl -s "$BASE/api/export?session=$SID" | head -1 | jq .
curl -s "$BASE/api/export?session=$SID&type=log,api.response&limit=5000" -o session.jsonl
```

`type=` is a comma-separated exact-match filter applied in SQL — pass the same type strings you see on events; they're stored verbatim and never renamed. Omitting `session=` exports the most recent session. `limit` is clamped to 1..5000 here (`/api/events` clamps to 1..2000 — the two endpoints differ).

> **`level=error` silently drops every `api.response` and `state.action.complete`.** Those events have no `level` field at all, and the filter keeps unleveled events only when the filter set literally contains the sentinel `__none__`. So `?level=error` answers "show me error logs" while quietly hiding every failed network request — the opposite of what someone asking about errors wants. Either write `?level=error,__none__`, or skip `level=` entirely and filter with `jq`.

## Watching a live session

There is **no streaming or server-sent-events endpoint**. Live push exists only on the dashboard's WebSocket (`ws://localhost:9092`), which is awkward to consume from a shell. To follow a session, poll — `/api/sessions/:id/events` returns the full history each call, so keep the last timestamp you saw and ask for what's newer:

```bash
LAST_TS=$(curl -s "$BASE/api/sessions/$SID/events" | jq -r '.events[-1].ts')
# ... reproduce the bug in the app ...
curl -s "$BASE/api/sessions/$SID/events" | jq --arg since "$LAST_TS" '[.events[] | select(.ts > $since)]'
```

A cleaner way to isolate a repro is to clear the log first — see below, and read the warning before you do.

## Write operations

Bookmarking is harmless and reversible. It marks a session as worth keeping, and the dashboard can filter to bookmarked sessions:

```bash
curl -s -X PATCH "$BASE/api/sessions/$SID" -H 'content-type: application/json' -d '{"is_important": true}'
curl -s "$BASE/api/sessions?is_important=true" | jq -r '.sessions[].id'
```

Resetting is not:

```bash
curl -s -X POST "$BASE/api/events/reset"   # DESTRUCTIVE
```

> `POST /api/events/reset` deletes **every event and every session**, not just the current one, and there is no undo. The user may be sitting on a session they spent an hour reproducing. Confirm with AskUserQuestion before you call it, every time, even when clearing the log is the obvious way to isolate a repro. Suggesting the user reset is fine; deciding for them is not.

## Going deeper

- `scripts/decode.jq` — the `decode` filter used above. Read it with `cat` into a shell variable; don't retype it.
- `references/api.md` — the exact contract for every endpoint: parameters, clamps, status codes, response shapes, and error bodies. Read it when a call returns something you didn't expect.
- `references/events.md` — what every field on an event and on `stats` means, the event type vocabulary, the level vocabulary, the placeholder sentinels, and which raw events the proxy silently drops. Read it when you're interpreting an event rather than fetching one.
