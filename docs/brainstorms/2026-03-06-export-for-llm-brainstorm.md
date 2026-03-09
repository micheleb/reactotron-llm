# Export Script for LLM Consumption — Brainstorm

**Date:** 2026-03-06
**Issue:** [#6](https://github.com/micheleb/reactotron-llm/issues/6)

## What We're Building

An export feature that lets a human download curated Reactotron events as a JSONL file from the dashboard, optimized for ingestion by LLM agents. The file includes session metadata and filtered events, ready to be shared with colleagues or fed to an agent for debugging and analysis.

### User Flow

1. Human opens the dashboard and applies filters (event type, level, etc.)
2. Human clicks an **Export** button
3. Browser downloads a JSONL file containing a session metadata header + matching curated events
4. Human shares the file or provides it to an LLM agent
5. Agent reads the JSONL file to understand app behavior

### Out of Scope (for now)

- Markdown or other output formats (JSONL only)
- Server-side summarization or event correlation
- State diffs on action events
- Dedicated session picker / export screen
- CLI export command (API endpoint only)
- Agent-side import tooling (agent reads the file directly)

## Why This Approach

### API endpoint + dashboard button

The existing Claude skill already interacts via REST API. A new `GET /api/export` endpoint fits this pattern. The dashboard provides the human-facing UI: an Export button that triggers a download using the endpoint with the current filter state. This avoids building a separate CLI tool and keeps the architecture simple.

### JSONL format

- One JSON object per line — easy to parse, stream, and filter
- First line is a session metadata envelope (app name, platform, timestamps, event count)
- Subsequent lines are curated events in the existing `CuratedEvent` shape
- Standard format with broad tooling support
- Compact and token-efficient for LLM context windows

### Session metadata envelope

Wrapping events with session context (app name, platform, duration) gives the LLM agent the full picture without needing a separate API call. This is the minimal "richer curation" that adds value over the existing `/api/events` endpoint.

### Pagination + filtering (no summarization)

The existing dashboard already has type and level filters. The export endpoint reuses these. For large sessions, limit/offset pagination lets consumers request manageable chunks. Summarization is deferred — YAGNI until proven necessary.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary audience | LLM agents | Optimize for machine-readable, tool-based ingestion |
| Invocation | API endpoint + dashboard button | Consistent with existing REST architecture |
| Output format | JSONL only | Simple, streamable, token-efficient; add formats later |
| Session discovery | Implicit (uses dashboard filters) | No need for a separate sessions endpoint yet |
| Size management | Pagination + type/level filters | Simple, composable, avoids premature summarization |
| Curation depth | Session metadata envelope only | State diffs and event correlation are future work |
| Dashboard UX | Export button applies current filters | Minimal UI addition, leverages existing filter state |

## JSONL Format Spec

```jsonl
{"_type": "session", "session_id": "abc-123", "app_name": "MyApp", "platform": "ios", "connected_at": "2026-03-06T10:00:00Z", "disconnected_at": "2026-03-06T10:30:00Z", "event_count": 42, "filters_applied": {"type": "log", "level": "error"}}
{"ts": "2026-03-06T10:01:00Z", "type": "log", "level": "error", "message": "Network timeout on /api/users"}
{"ts": "2026-03-06T10:02:00Z", "type": "api.response", "network": {"method": "GET", "url": "/api/users", "status": 500, "durationMs": 3200}}
```

- First line: session metadata with `_type: "session"` discriminator
- Subsequent lines: `CuratedEvent` objects (existing type, unchanged)
- File naming: `reactotron-export-<session_id_prefix>-<timestamp>.jsonl`

## API Design

```
GET /api/export?type=log,api.response&level=error&limit=500&offset=0
```

**Query params:**
- `type` — comma-separated event types to include
- `level` — filter by log level
- `limit` — max events (default 1000, max 5000)
- `offset` — pagination offset
- `session` — session ID (optional; defaults to most recent session)

**Response:**
- `Content-Type: application/x-ndjson`
- `Content-Disposition: attachment; filename="reactotron-export-....jsonl"`
- Body: JSONL stream (session metadata line + event lines)

## Open Questions

1. Should the export include raw JSON blobs alongside curated events for cases where curation loses information?
2. Should there be a max export size limit to prevent accidentally downloading gigabytes?
3. How should the file naming include enough context to be useful (app name? date range? filter summary)?
