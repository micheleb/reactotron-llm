# reactotron-llm-proxy

Bun-based Reactotron-compatible proxy with a React + Chakra viewer dashboard.

## Services

- **Proxy/API server**: `http://localhost:9090`
  - Reactotron app WebSocket endpoint: `ws://localhost:9090/` (or `/ws`)
  - `GET /health`
  - `GET /dump-state`
  - `GET /api/events?limit=300`
  - `GET /api/state`
- **Dashboard live WS**: `ws://localhost:9092`
- **Dashboard UI (Vite dev)**: `http://localhost:5173`

## Run

```bash
bun install
cd dashboard && bun install && cd ..
bun run start
bun run dashboard:dev
```

## Output files

- `.reactotron-llm/app-log.jsonl` (curated events only)
- `.reactotron-llm/state.json` (after `/dump-state`)
