---
title: "feat: Add copy/paste mode to web dashboard"
type: feat
status: completed
date: 2026-03-17
origin: docs/brainstorms/2026-03-17-copy-paste-mode-brainstorm.md
---

# feat: Add copy/paste mode to web dashboard

## Overview

Add three complementary copy/paste capabilities to the dashboard so users can easily extract event data as clean markdown for pasting into LLM chat interfaces (Claude, ChatGPT, etc.).

1. **Per-event copy button** on each `EventCard`
2. **"Copy All Visible" button** in the toolbar
3. **Text mode toggle** that replaces the event list with a selectable `<pre>` block

All logic is client-side. No backend changes. (see brainstorm: `docs/brainstorms/2026-03-17-copy-paste-mode-brainstorm.md`)

## Problem Statement / Motivation

Copying text from the styled HTML dashboard produces garbled output — mixed formatting, missing data from collapsed accordions, broken line breaks. The primary use case is feeding event context to LLMs, which need clean, structured text. The existing `/api/export` endpoint serves programmatic access, but there's no quick way to grab events from the dashboard UI itself.

## Proposed Solution

A shared `formatEventAsMarkdown(event, detail)` utility that converts `CuratedEvent` objects to markdown strings at two detail levels. This utility powers all three capabilities. State is ephemeral (component-local, no persistence).

### Architecture

```
┌─────────────────────────────────────────────────┐
│  dashboard/src/utils/markdown.ts                │
│  ─────────────────────────────────────────────  │
│  formatEventMarkdown(event, 'summary' | 'full') │
│  formatEventsMarkdown(events, metadata?)         │
│  formatSessionHeader(metadata)                   │
└──────────────┬──────────────────┬───────────────┘
               │                  │
    ┌──────────▼──────┐   ┌──────▼──────────────┐
    │   EventCard.tsx  │   │  FilterBar.tsx       │
    │  (copy button)   │   │  (Copy All + Toggle) │
    └─────────────────┘   └─────────────────────┘
               │                  │
    ┌──────────▼──────────────────▼───────────────┐
    │  App.tsx / SessionDetail.tsx                 │
    │  (text mode conditional rendering)          │
    └─────────────────────────────────────────────┘
```

### Markdown Format Specification

#### Summary level (one line per event)

```
`12:34:56.789` **log** — User clicked submit button
`12:34:56.800` **api.response** — GET /api/users → 200 (45ms)
`12:34:56.810` **state.action.complete** — `INCREMENT_COUNTER` (changed: users.list, users.loading)
`12:34:56.820` **benchmark** — "Render cycle" (120ms)
`12:34:56.830` **client.intro** — MyApp (ios)
`12:34:56.840` **custom.event** — (no message)
```

Rules:
- Format: `` `HH:MM:SS.mmm` **type** — summary ``
- `log`: use `event.message`, fallback `"(no message)"`
- `api.response`: `METHOD URL → STATUS (DURATIONms)`. Omit parts that are null.
- `state.action.complete`: action name/type in backticks. Append `(changed: ...)` if `changed` is non-empty.
- `benchmark`: title in quotes, total duration if available.
- `client.intro`: app name and platform from `event.details`.
- Other/unknown: use `event.message` if present, else `"(no message)"`.
- Omit undefined/null fields rather than showing "N/A".

#### Full detail level (multi-line per event)

```markdown
### log — 12:34:56.789
User clicked submit button

---

### api.response — 12:34:56.800
**GET** `/api/users` → **200** (45ms)

**Request Body**
```json
{ "page": 1 }
```

**Response Body**
```json
[{ "id": 1, "name": "Alice" }]
```

**Request Headers**
```json
{ "Authorization": "Bearer ..." }
```

**Response Headers**
```json
{ "Content-Type": "application/json" }
```

---

### state.action.complete — 12:34:56.810
Action: `INCREMENT_COUNTER`
Changed: `users.list`, `users.loading`

**Payload**
```json
{ "amount": 1 }
```

---

### benchmark — 12:34:56.820
**Render cycle**

**Steps**
```json
[{ "title": "mount", "delta": 40 }, { "title": "paint", "delta": 80 }]
```
```

Rules:
- Heading: `### type — HH:MM:SS.mmm`
- Each event separated by `---`
- JSON blocks use triple-backtick fences with `json` language tag
- Apply `normalizePlaceholders` before serializing (convert `~~~ null ~~~` → `null`, etc.)
- Omit sections for null/undefined fields entirely
- If JSON content contains triple backticks, use quadruple backtick fences
- `details` field (if present and non-empty): render as a fenced JSON block labeled "**Details**"
- `stack` field: render as a fenced code block (no language tag)

#### Bulk copy header (prepended to "Copy All Visible" output)

```markdown
## Reactotron Events — MyApp (ios)
**Time range:** 12:30:00.000 – 12:45:23.456 | **Events:** 42

```

- In **Session Detail**: use session metadata (app_name, platform, connected_at/disconnected_at)
- In **Live view**: extract app_name/platform from the most recent `client.intro` event in the unfiltered event list. If none exists, omit app name/platform and just show time range and count.

## Technical Considerations

### Text mode + live WebSocket events

When text mode is active in the Live view, new events arriving via WebSocket would cause the `<pre>` block to re-render, disrupting manual text selection. **Solution: snapshot the events at toggle time.** Show a small indicator ("N new events since snapshot") with a refresh button to re-snapshot. In Session Detail (static data), this is not an issue.

### Performance for large event lists

Text mode renders all visible events into a single DOM node. For 1000+ events with full payloads, this could be megabytes of text. **Mitigations:**
- Show event count and approximate size when entering text mode
- The existing filter system naturally limits visible events
- No hard truncation — trust users to filter first

### Clipboard API fallback

`navigator.clipboard.writeText()` can fail (non-HTTPS, permissions denied, browser support). **Fallback:** on failure, show a modal with a `<textarea>` containing the markdown so the user can manually Ctrl+A → Ctrl+C. Show a toast explaining the fallback.

### Copy confirmation UX

- **Per-event button:** icon changes from clipboard to checkmark for 1.5s
- **Copy All Visible:** Chakra `useToast` notification: "Copied N events to clipboard" (2s duration)
- Both include `aria-live="polite"` announcements for screen readers

### Shared utility extraction

`normalizePlaceholders` and `formatJson` are currently duplicated in `EventCard.tsx` and `App.tsx`. Extract them to a shared utility file and import from both places + the new markdown formatter.

## System-Wide Impact

- **Interaction graph**: Copy buttons call `navigator.clipboard.writeText()` → triggers browser permission prompt (first time only) → writes to system clipboard. Text mode toggle flips a boolean state → conditional render swaps EventCard list for `<pre>` block. No server interaction.
- **Error propagation**: Clipboard API errors are caught and handled with a toast + textarea fallback. No retries, no cascading failures.
- **State lifecycle risks**: None — all state is ephemeral React component state. No database, no persistence.
- **API surface parity**: No API changes. The `/api/export` JSONL endpoint remains the programmatic interface.
- **Integration test scenarios**: Playwright tests should verify (1) per-event copy button writes expected markdown to clipboard, (2) Copy All writes expected markdown with header, (3) text mode toggle renders/hides the `<pre>` block, (4) clipboard fallback modal appears when clipboard API is unavailable.

## Acceptance Criteria

- [x] `formatEventMarkdown(event, 'summary')` returns a one-line markdown string for any `CuratedEvent`
- [x] `formatEventMarkdown(event, 'full')` returns a multi-line markdown block with fenced code blocks for structured data
- [x] `normalizePlaceholders` is applied to all JSON output (no `~~~ null ~~~` in markdown)
- [x] Per-event copy button appears on each `EventCard` (all views: live, session detail, compare)
- [x] Per-event copy button writes full-detail markdown to clipboard and shows checkmark confirmation
- [x] "Copy All Visible" button appears in the toolbar (live view and session detail view)
- [x] "Copy All Visible" copies summary-level markdown for all filtered events with a session metadata header
- [x] Text mode toggle appears in the FilterBar area (live view and session detail view)
- [x] Text mode replaces the event list with a `<pre>` block showing full-detail markdown
- [x] In live view, text mode snapshots events at toggle time and shows a "N new events" refresh indicator
- [x] Clipboard failure shows a fallback modal with a `<textarea>` for manual copy
- [x] Copy confirmation uses toast notifications (bulk) and icon change (per-event)
- [x] All new UI elements follow the existing Chakra UI theme (colors from `theme.ts`, `variant="subtle"` for buttons)
- [x] Playwright tests cover per-event copy, bulk copy, text mode toggle, and clipboard fallback

## Success Metrics

- Users can paste event data into an LLM chat and get well-formatted, parseable markdown
- No garbled output from styled HTML when copying from text mode
- Copy operations complete instantly (< 100ms for typical event counts)

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Clipboard API blocked by browser | Medium | Medium | Textarea fallback modal |
| Large event lists cause slow text mode render | Low | Medium | Filters naturally limit; no hard truncation |
| Markdown format doesn't suit all LLM UIs | Low | Low | Format is standard markdown; iterate based on feedback |
| `normalizePlaceholders` extraction breaks existing behavior | Low | High | Extract without changing logic; existing tests cover it |

## Files to Change

### New files

| File | Purpose |
|------|---------|
| `dashboard/src/utils/markdown.ts` | `formatEventMarkdown()`, `formatEventsMarkdown()`, `formatSessionHeader()` |
| `dashboard/src/utils/normalize.ts` | Extracted `normalizePlaceholders`, `formatJson`, `formatTime` (shared) |
| `dashboard/src/components/CopyButton.tsx` | Small icon button component with clipboard write + checkmark animation |
| `dashboard/src/components/TextModeView.tsx` | `<pre>` block rendering for text mode with snapshot/refresh logic |
| `dashboard/src/components/ClipboardFallbackModal.tsx` | Modal with textarea for manual copy when clipboard API fails |
| `tests/copy-paste.spec.ts` | Playwright E2E tests for all copy/paste features |

### Modified files

| File | Changes |
|------|---------|
| `dashboard/src/components/EventCard.tsx` | Add `CopyButton`, import from shared `normalize.ts` instead of local helpers |
| `dashboard/src/components/FilterBar.tsx` | Add `textMode` toggle button and `onCopyAll` callback prop |
| `dashboard/src/App.tsx` | Add text mode state, conditional rendering, "Copy All" handler, import from shared `normalize.ts` |
| `dashboard/src/components/SessionDetail.tsx` | Add text mode state, conditional rendering (swap Virtuoso for TextModeView), "Copy All" handler |

### Untouched files

| File | Reason |
|------|--------|
| `src/index.ts` | No backend changes |
| `src/db.ts` | No database changes |
| `src/shared/curate.ts` | No curation changes |
| `dashboard/src/components/SessionCompare.tsx` | Per-event copy comes from EventCard automatically; no toolbar features in compare view |

## Implementation Phases

### Phase 1: Shared utilities

- Extract `normalizePlaceholders`, `formatJson`, `formatTime` into `dashboard/src/utils/normalize.ts`
- Update imports in `EventCard.tsx` and `App.tsx`
- Create `dashboard/src/utils/markdown.ts` with `formatEventMarkdown(event, detail)` and `formatEventsMarkdown(events, metadata?)`
- Verify no regressions with existing rendering

### Phase 2: Per-event copy button

- Create `CopyButton` component (icon button with clipboard write + checkmark animation + clipboard fallback)
- Create `ClipboardFallbackModal` component
- Add `CopyButton` to `EventCard` header row (left of timestamp badge)
- Test in live view, session detail, and session compare

### Phase 3: Copy All Visible + Text mode toggle

- Add `textMode` and `onCopyAll` props to `FilterBar`
- Add toggle button and Copy All button to FilterBar layout
- Implement text mode state + conditional rendering in `App.tsx` (live view)
- Implement text mode state + conditional rendering in `SessionDetail.tsx`
- Create `TextModeView` component with snapshot/refresh logic for live view
- Add session metadata header to Copy All output

### Phase 4: Tests

- Playwright tests for per-event copy, bulk copy, text mode toggle
- Test clipboard fallback (mock clipboard API failure)
- Test text mode snapshot behavior in live view
- Test that filters are respected in Copy All and text mode output

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-17-copy-paste-mode-brainstorm.md](docs/brainstorms/2026-03-17-copy-paste-mode-brainstorm.md) — Key decisions carried forward: markdown format for LLM consumption, client-side only (no backend), two detail levels (summary/full), both clipboard buttons and visual text mode, ephemeral state.

### Internal References

- Event rendering: `dashboard/src/components/EventCard.tsx`
- Filter toolbar: `dashboard/src/components/FilterBar.tsx`
- Live view: `dashboard/src/App.tsx:362-398`
- Session detail: `dashboard/src/components/SessionDetail.tsx:289-327`
- Filter hook: `dashboard/src/hooks/useEventFilter.ts`
- CuratedEvent type: `src/shared/types.ts:30-60`
- Theme: `dashboard/src/theme.ts`
- Existing export: `dashboard/src/App.tsx:273-284`

### Related Work

- Issue: [#8](https://github.com/micheleb/reactotron-llm/issues/8)
- Existing JSONL export: `/api/export` endpoint in `src/index.ts`
