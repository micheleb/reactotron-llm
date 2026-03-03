# Event Format Reference

Each line in `.reactotron-llm/app-log.jsonl` is a JSON object (a "curated event"). The same format is returned by `GET /api/events`.

## Common Fields

Every event has:

| Field | Type | Description |
|-------|------|-------------|
| `ts` | string | ISO 8601 timestamp of when the proxy received the event |
| `type` | string | Event type identifier |

Optional fields present on some events:

| Field | Type | Description |
|-------|------|-------------|
| `level` | string | Log severity (`debug`, `info`, `warn`, `error`) |
| `message` | string | Human-readable message |
| `stack` | string | Stack trace (on errors) |
| `action` | object | MobX/Redux action details |
| `network` | object | HTTP request/response details |
| `benchmark` | object | Performance benchmark data |
| `details` | object | Scalar metadata from the raw event |

## Event Types

### `log`

App console output captured by Reactotron.

```json
{
  "ts": "2026-03-03T07:05:43.369Z",
  "type": "log",
  "level": "debug",
  "message": "[debug] no cast info",
  "details": { "type": "log", "important": "~~~ false ~~~" }
}
```

Key fields: `level`, `message`. Filter by `level` to find warnings/errors.

### `api.response`

HTTP request/response pair captured by Reactotron's networking plugin.

```json
{
  "ts": "2026-03-03T07:05:44.439Z",
  "type": "api.response",
  "network": {
    "method": "POST",
    "url": "https://example.com/api/endpoint",
    "status": 200,
    "durationMs": 185.14,
    "requestHeaders": { ... },
    "responseHeaders": { ... },
    "requestBody": { ... },
    "responseBody": { ... },
    "error": null
  }
}
```

Key fields in `network`: `method`, `url`, `status`, `durationMs`, `requestBody`, `responseBody`, `error`.

### `state.action.complete`

MobX/Redux action that finished executing.

```json
{
  "ts": "2026-03-03T07:05:43.327Z",
  "type": "state.action.complete",
  "action": {
    "type": "state.action.complete",
    "name": "loadProvidersFromAPI",
    "path": "/SomeStore",
    "displayName": "SomeStore.loadProvidersFromAPI()",
    "payload": { ... }
  },
  "changed": ["field1", "field2"],
  "details": { "deltaTime": 212 }
}
```

Key fields: `action.name`, `action.displayName`, `action.payload`, `changed` (list of state fields that changed), `details.deltaTime` (execution time in ms).

## Dropped Events

The proxy silently drops noise events: `ping`, `pong`, `heartbeat`, `connected`, `client.intro`. These never appear in the JSONL or API.
