# reactotron-llm-proxy

Bun-based Reactotron-compatible proxy that makes your existing logs readable for an LLM agent.

## Goal

`reactotron-llm-proxy` is a drop-in replacement for the standard [Reactotron](https://github.com/infinitered/reactotron) client. You do not need to change your app code: run `reactotron-llm-proxy` instead of the Reactotron desktop client, and your agent can read the same information you see.

It listens on port `9090` — the port `reactotron-react-native` already connects to by default — records every event into SQLite, and exposes them over a small HTTP API. An agent answers questions about the running app with `curl` and `jq`. A human can read the same events in the web dashboard.

**Quit the Reactotron desktop app before starting this one.** They both bind port `9090`, so they cannot run at the same time: whichever starts first holds the port, and your app connects to that one. This proxy takes the desktop client's place for the duration of your session.

That trade is deliberate, not permanent. For deeper manual log analysis the desktop client is still the better tool — stop the proxy and start it back up. Replacing it outright is not a goal of this project.

## Quick start

Install dependencies once:

```bash
bun install
bun install --cwd dashboard
```

Then, before either scenario:

1. **Quit the Reactotron desktop app.** It owns port `9090` while it's open, and the proxy will fail to start.
2. **Start from the repo root.** The output directory resolves against the current working directory, so launching from elsewhere silently creates an empty database in the wrong place.

Now pick the scenario you're in.

### Scenario 1 — LLM only (no dashboard)

An agent reads the app's logs, network calls, and state directly over HTTP. Nothing to look at, nothing to keep open.

Install the Claude skill once, by symlink, so it stays in sync with the repo:

```bash
mkdir -p ~/.claude/skills
ln -s "$PWD/.claude/skills/reactotron-llm" ~/.claude/skills/reactotron-llm
```

Start the proxy and leave it running:

```bash
bun run start
```

Launch your app. That's the whole setup — ask Claude "what is the app doing?", "why did that request fail?", or "find the errors", and the skill takes over. It knows the endpoints, the event shapes, and the traps.

The symlink matters: the skill locates this repo by reading its own install path, which is how it finds the SQLite file for timing queries. A copied directory breaks that.

To drive the API yourself, start here and follow `.claude/skills/reactotron-llm/references/api.md`:

```bash
curl -s http://localhost:9090/health | jq '{ok, clients}'
SID=$(curl -s http://localhost:9090/api/sessions | jq -r '.sessions[0].id')
curl -s http://localhost:9090/api/sessions/$SID/events | jq '.total'
```

### Scenario 2 — With a human (dashboard)

You want to watch events stream in, filter them by hand, and trigger state snapshots. Run the proxy and the dashboard together:

```bash
bun run dev:all
```

Open **http://localhost:5173** and launch your app. Each connected client gets its own tab. The dashboard defaults to `http://localhost:9090` and `ws://localhost:9092`; both are editable in the UI if you changed the ports.

The agent is still available while the dashboard is open — they read the same database and don't conflict. Set up the skill as in Scenario 1 and you get both: you watch the stream, Claude answers questions about it.

`dev:all` runs the proxy in watch mode, so it restarts when you edit its source. Use `bun run start` and `bun run dashboard:dev` in separate terminals if you don't want that.

## Connect your app

Nothing to configure when the app runs in a simulator on this machine — `Reactotron.configure()` already points at `localhost:9090`.

From a physical device, point it at your machine as you would for the desktop client:

```ts
Reactotron.configure({ host: '192.168.1.42' })
```

Check `clients` in `GET /health` to confirm the app attached. `clients: 0` means the proxy is up but nothing is connected — past sessions are still queryable, but you can't capture a fresh state snapshot.

### Port 9090 is taken

Almost always the Reactotron desktop app, still open. The proxy exits immediately with `EADDRINUSE`:

```
error: Failed to start server. Is port 9090 in use?
 syscall: "listen",
    code: "EADDRINUSE"
```

Quit the desktop app and start the proxy again. If quitting it doesn't free the port, find out what else is holding it before you kill anything:

```bash
lsof -ti:9090 | xargs -r ps -o pid=,comm= -p
```

The reverse case is quieter and worth knowing: if the desktop app got there first, the proxy never starts, your app connects to the desktop client instead, and everything *looks* fine — except the agent reads an empty or stale database, because no events ever reached the proxy. A `curl http://localhost:9090/health` that returns anything other than this proxy's JSON (the desktop app has no `/health` route) tells you which one you're actually talking to.

## Services

- **Proxy/API server**: `http://localhost:9090`
  - Reactotron app WebSocket endpoint: `ws://localhost:9090/` (or `/ws`)
  - `GET /health` — is the proxy up, and is an app attached
  - `GET /dump-state?session=<id>` — ask the connected app for a fresh state snapshot
  - `GET /api/sessions` — every session, newest first
  - `GET /api/sessions/:id` — one session, with stats and an event-type histogram
  - `GET /api/sessions/:id/events` — every curated event for that session
  - `GET /api/sessions/compare?a=<id>&b=<id>` — diff two runs
  - `GET /api/export?session=<id>` — JSONL: a session header line, then one line per event
  - `GET /api/state` — the last snapshot written to disk
  - `GET /api/events?limit=300` — all sessions mixed together; prefer the per-session endpoint
- **Dashboard live WS**: `ws://localhost:9092`
- **Dashboard UI (Vite dev)**: `http://localhost:5173`

A client and a session are the same thing: one UUID serves as both the WebSocket client id and the session id.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `9090` | Proxy/API server, and the port the app connects to |
| `DASHBOARD_WS_PORT` | `9092` | Live push to the dashboard |
| `OUTPUT_DIR` | `.reactotron-llm` | Resolved against the current working directory |

## Output files

- `.reactotron-llm/reactotron.db` (SQLite database — raw events + sessions)
- `.reactotron-llm/state.json` (after `/dump-state`)
