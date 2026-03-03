# reactotron-llm-proxy

Bun-based Reactotron-compatible proxy that makes your existing logs readable for an LLM agent.

## Goal

`reactotron-llm-proxy` is a drop-in replacement for the standard [Reactotron](https://github.com/infinitered/reactotron) client. You do not need to change your app code: run `reactotron-llm-proxy` instead of the Reactotron desktop client, and your agent can read the same information you see.

You can use the web dashboard to view logs while the proxy is running and to trigger state snapshots for the LLM. For deeper manual log analysis, use the official Reactotron desktop client; replacing it is not a goal of this project.

## Run

```bash
bun install
cd dashboard && bun install && cd ..
bun run start
bun run dashboard:dev
```

## Services

- **Proxy/API server**: `http://localhost:9090`
  - Reactotron app WebSocket endpoint: `ws://localhost:9090/` (or `/ws`)
  - `GET /health`
  - `GET /dump-state`
  - `GET /api/events?limit=300`
  - `GET /api/state`
- **Dashboard live WS**: `ws://localhost:9092`
- **Dashboard UI (Vite dev)**: `http://localhost:5173`

## Output files

- `.reactotron-llm/reactotron.db` (SQLite database — raw events + sessions)
- `.reactotron-llm/state.json` (after `/dump-state`)
