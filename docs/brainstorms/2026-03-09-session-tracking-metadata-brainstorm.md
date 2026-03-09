# Session Tracking & Metadata Brainstorm

**Date:** 2026-03-09
**Issue:** https://github.com/micheleb/reactotron-llm/issues/3

## What We're Building

Enriching the existing session infrastructure with three capabilities:

1. **Summary stats** — At-a-glance metrics for each session: event counts by type, error/warning counts, failed network requests, slowest request, longest benchmark, and API latency percentiles. Computed on-the-fly for active sessions, materialized (cached in `stats_json` column) on disconnect.

2. **Session bookmarking** — Simple star/flag toggle on any session. One-click to mark as important, filterable in the session list. No notes or tags — just a boolean.

3. **Session comparison** — Side-by-side view of two sessions, aligned by event type. Shows grouped stats and event lists per type, making it easy to spot regressions or differences between sessions.

## Why This Approach

**Incremental, stats-first architecture (Approach A)**:

- Each layer ships independently and is useful on its own
- Summary stats create a foundation that makes comparison fast and meaningful
- Bookmarking is trivially simple and can slot in at any point
- Respects the existing raw-first architecture — stats are derived from `raw_events`, not maintained separately
- Avoids over-engineering (no normalized stats tables, no rich query API)

**Rejected alternatives:**
- *Comparison-first (B)*: Building the hardest feature first without cached stats would be slow for large sessions and riskier
- *Rich stats table (C)*: Normalized `session_stats` table with query API is over-engineered for current needs (YAGNI)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Stats computation | Hybrid (cache on disconnect, compute live) | Fast reads for completed sessions, live stats for active ones |
| Stats storage | `stats_json` TEXT column on `sessions` table | Simple, no new tables, JSON flexibility for evolving stats shape |
| Which stats | Event counts by type, error/warning counts, failed network requests, slowest request, longest benchmark, API latency percentiles | Full picture — let the user scan what matters |
| Bookmarking model | `is_important` boolean on `sessions` | Simplest possible approach. No notes, no tags |
| Comparison alignment | Event-type grouping | Group events by type, show counts and details side-by-side. More useful than time-relative alignment for spotting what changed |
| Build order | Stats → Bookmarking → Comparison | Each layer builds on the previous; stats foundation makes comparison efficient |

## Existing Infrastructure

The codebase already has:
- `sessions` table with `id`, `connected_at`, `disconnected_at`, `app_name`, `platform`, `client_metadata`
- `raw_events` table with `session_id` FK, `type`, `timestamp`, `raw_json`
- `GET /api/sessions` and `GET /api/sessions/:id/events` endpoints
- `SessionTree.tsx` (grouped session browser) and `SessionDetail.tsx` (full-page session viewer)
- `CuratedEvent` type and `curateEvent()` pipeline in shared code

This feature enriches what exists rather than building from scratch.

## Open Questions

- **Stats backfill**: How to populate `stats_json` for existing completed sessions? Run a one-time migration or compute lazily on first access?
- **Stats invalidation**: If curation logic changes (new event type extraction), should cached stats be recomputed? Probably yes — need a version/hash mechanism or just recompute all on startup.
- **Comparison UI layout**: Exact layout of the side-by-side view — two columns? Tabbed per event type? Needs design exploration during planning.
- **Comparison selection UX**: How does the user select two sessions to compare? Checkboxes in the session tree? A "Compare with..." action from a session detail?
- **LLM API surface**: Should the comparison stats be available via the REST API for LLM agents? (e.g., `GET /api/sessions/compare?a=X&b=Y`)
