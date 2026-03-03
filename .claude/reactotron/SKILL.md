---
name: reactotron
description: >
  Inspect and debug a React Native app using reactotron-llm, a Reactotron-compatible proxy
  that stores raw events in SQLite. Use this skill when you need to investigate
  what a React Native app is doing at runtime: view logs, API requests/responses, state
  changes, MobX/Redux actions, benchmarks, or capture the current app state. Triggers on
  "what is the app doing", "check reactotron", "inspect the app", "show me the logs",
  "debug the React Native app", "what API calls is the app making", "show app state",
  "check network requests", or any request to observe React Native app runtime behavior.
---

# Reactotron LLM Inspector

Inspect a running React Native app via reactotron-llm, a Reactotron-compatible proxy at `http://localhost:9090`.

## Startup Procedure

Before reading any data, verify the proxy is running:

```bash
curl -s http://localhost:9090/health
```

**If the health endpoint returns JSON with `"ok": true`** — the proxy is running. Proceed to [Reading Events](#reading-events).

**If the request fails or returns non-JSON** — port 9090 may be occupied by the regular Reactotron desktop app (which does NOT have a `/health` endpoint). Check:

```bash
lsof -i :9090 -sTCP:LISTEN
```

- **If a process is listening on 9090**: The regular Reactotron desktop app is blocking the port. Use the AskUserQuestion tool to propose killing it and starting the proxy:
  > "Port 9090 is in use by [process name] (PID [pid]). To inspect the app with reactotron-llm, I need to kill this process and start the proxy. Should I proceed?"

  If approved, kill the process and start the proxy:
  ```bash
  kill <pid>
  cd /Users/michelebonazza/git/reactotron-llm && bun start
  ```

- **If port 9090 is free**: Use the AskUserQuestion tool to propose starting the proxy:
  > "reactotron-llm is not running. Should I start it? (The React Native app will need to reconnect.)"

  If approved:
  ```bash
  cd /Users/michelebonazza/git/reactotron-llm && bun start
  ```

Start the proxy as a background process so it doesn't block your session. After starting, wait a few seconds and verify with the `/health` endpoint again.

## Reading Events

Use the REST API to read curated events. The API curates raw events from SQLite on-the-fly.

### Recent events

```bash
curl -s 'http://localhost:9090/api/events?limit=50'
```

Returns `{ "ok": true, "count": N, "events": [...] }`. Adjust `limit` (1–2000, default 200) based on how far back you need to look. Start with a small limit (20–50) and increase if needed.

### App state snapshot

Request a fresh state dump from connected clients:

```bash
curl -s http://localhost:9090/dump-state
```

Then read the captured state:

```bash
curl -s http://localhost:9090/api/state
```

Returns `{ "ok": true, "state": { ... } }` with the full MobX/Redux state tree. Returns 404 if no state has been captured yet — the app must send a state event first.

### Reset the log

```bash
curl -s -X POST http://localhost:9090/api/events/reset
```

Useful to clear old events before reproducing an issue.

### Health / connection info

```bash
curl -s http://localhost:9090/health
```

Returns `{ "ok": true, "port": 9090, "clients": N, ... }`. The `clients` field shows how many app instances are connected. If `clients` is 0, the React Native app is not connected to the proxy.

## Event Format

See [references/event-format.md](references/event-format.md) for the full event schema and type details.

## Investigation Workflow

1. Check `/health` to confirm the proxy is running and a client is connected (`clients > 0`)
2. Fetch recent events with `/api/events?limit=50` to get an overview
3. Filter events by `type` field to focus on what matters:
   - `log` — app console logs (check `level` and `message`)
   - `api.response` — network requests (check `network.url`, `network.status`, `network.durationMs`)
   - `state.action.complete` — MobX/Redux actions (check `action.name`)
4. For state inspection, call `/dump-state` then `/api/state`
5. To isolate a specific flow, call `/api/events/reset`, reproduce the issue in the app, then fetch events again
