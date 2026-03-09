# Historical Log Browser Brainstorm

- **Date:** 2026-03-06
- **Issue:** https://github.com/micheleb/reactotron-llm/issues/9
- **Status:** Complete

## What We're Building

A first-class historical log browser in the web dashboard that lets users navigate past sessions stored in SQLite, grouped by date, client app, and session. This makes the full event history immediately discoverable — not just the live stream.

## Why This Approach

The project already stores all events in SQLite with a `sessions` table tracking connection lifecycles (app name, platform, timestamps). The infrastructure exists; we just need the UI and API endpoints to expose it.

## Key Decisions

### 1. UI Pattern: Tab Bar

**Decision:** Add "Live" and "History" tabs at the top of the dashboard.

- **Live tab:** Current real-time event stream (existing behavior)
- **History tab:** Session browser with grouped navigation

**Rationale:** Clean separation between modes. Users immediately see that historical data is available. Familiar pattern. The tabs replace the current header area without needing a sidebar or splitting the view.

### 2. Session Organization: Grouped Tree

**Decision:** Hierarchical grouping: Date → Client App → Session.

- Top-level groups by date (Today, Yesterday, specific dates)
- Within each date, sub-groups by client app name + platform
- Within each app, individual sessions showing time range and event count
- Groups are collapsible; today's group is expanded by default

**Rationale:** Provides natural drill-down for projects with multiple apps or frequent sessions. The `sessions` table already has `app_name`, `platform`, `connected_at`, and `disconnected_at` — all the data needed for this hierarchy.

### 3. Event Display: Full-Page Takeover

**Decision:** Clicking a session navigates to a full-width dedicated view showing that session's events.

- Header shows session metadata (app name, platform, time range, event count)
- Back button returns to the session list
- Reuses the same event card rendering from the Live tab
- Includes the same type/level/URL filters
- Full width gives more space for event details (network payloads, stack traces)

**Rationale:** Maximizes screen space for event inspection. Simpler than a split-panel layout. The back navigation is straightforward.

### 4. Pagination: Virtual Scrolling

**Decision:** Use a virtualized list (e.g. `react-window`) to render only visible events.

**Rationale:** Sessions can have thousands of events. Virtual scrolling provides smooth performance without "Load more" button clicks. This is a dev tool where users may scroll through large event lists frequently.

### 5. Search: Deferred

**Decision:** No text search in the initial version. Ship the session browser first.

**Rationale:** The session browser + event viewer delivers significant value on its own. Text search (especially full-text) adds complexity. It can be added as a follow-up feature.

## New API Endpoints Needed

- `GET /api/sessions` — List all sessions with metadata, ordered by `connected_at DESC`
- `GET /api/sessions/:id/events` — Get events for a specific session, with `limit`/`offset` params

Both endpoints can be built on existing SQLite tables and the curation pipeline.

## Open Questions

- Should the State Snapshot panel appear in the historical session view? (It shows the current live state, which wouldn't apply to a past session.)
- Data retention: should there be a way to delete old sessions or set a retention policy? (Probably a separate issue.)
- Should session metadata show a breakdown of event types (e.g. "28 API calls, 3 errors") in the tree view? Nice-to-have but adds query complexity.

## Out of Scope

- Text search / full-text search across events
- Cross-session event search
- Data export
- Data retention / pruning policies
- Calendar-based navigation
