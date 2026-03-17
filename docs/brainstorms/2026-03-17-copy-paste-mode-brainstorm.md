# Brainstorm: Copy/Paste Mode for Web Dashboard

**Date:** 2026-03-17
**Issue:** [#8](https://github.com/micheleb/reactotron-llm/issues/8)
**Status:** Draft

## What We're Building

A copy/paste feature for the web dashboard that makes it easy to copy event data as clean, markdown-formatted text — primarily for pasting into LLM chat interfaces (Claude, ChatGPT, etc.).

Three capabilities:
1. **Per-event copy button** — icon on each `EventCard` that copies that event's full-detail markdown to clipboard
2. **"Copy All Visible" button** — in the toolbar/filter bar, copies summary-level markdown for all currently filtered events
3. **Text mode toggle** — switches the event list from rich `EventCard` rendering to a `<pre>` block displaying full-detail markdown for all visible events, allowing manual text selection

## Why This Approach

**Client-side only (Approach A)** was chosen over backend endpoints because:
- Solves the stated problem (copying from the dashboard) with zero API changes
- The `/api/export` endpoint already serves programmatic LLM access as JSONL
- Simpler to implement, test, and iterate on
- No network latency on copy — formatting is instant from in-memory `CuratedEvent` objects

## Key Decisions

1. **Output format: Markdown** — chosen because the primary target is LLM chat UIs that render markdown. Code-fenced blocks for structured data (JSON payloads, headers, bodies) make content clear to both humans and LLMs.

2. **Two detail levels:**
   - **Summary**: one-liner per event (timestamp, type, message/key info). Used by "Copy All Visible" to keep bulk output compact.
   - **Full**: multi-line block with all available fields. Used by per-event copy and text mode. Network requests include method/URL/status in summary, with headers and bodies in fenced code blocks. Action payloads shown in fenced JSON blocks.

3. **Granularity: both individual and bulk** — per-event copy button on each card, plus a "Copy All Visible" button that respects current filters.

4. **Visual text mode + clipboard buttons** — not just clipboard-only. Text mode re-renders the event list as a `<pre>` block so users can manually select partial content when needed.

5. **Ephemeral state** — text mode toggle resets on page refresh. No localStorage persistence needed.

6. **Implementation is purely client-side** — a shared `formatEventAsMarkdown(event, detail)` utility in the dashboard, no backend changes.

## Markdown Format Sketch

### Summary (one-liner)

```
`12:34:56.789` **log** — User clicked submit button
`12:34:56.800` **api.response** — GET /api/users → 200 (45ms)
`12:34:56.810` **state.action.complete** — `INCREMENT_COUNTER`
```

### Full detail (per-event)

```markdown
### log — 12:34:56.789
User clicked submit button

---

### api.response — 12:34:56.800
**GET** `/api/users` → **200** (45ms)

**Request Body**
\`\`\`json
{ "page": 1 }
\`\`\`

**Response Body**
\`\`\`json
[{ "id": 1, "name": "Alice" }]
\`\`\`

---

### state.action.complete — 12:34:56.810
Action: `INCREMENT_COUNTER`

**Payload**
\`\`\`json
{ "amount": 1 }
\`\`\`
```

## Resolved Questions

1. **Session metadata header**: Yes — "Copy All Visible" will prepend a short header with app name, platform, and session time range to give LLMs framing context.
2. **Expandable sections**: No `<details>` tags — always show data expanded inline with code fences. Many LLM chat UIs don't render `<details>`, so inline is more reliable.

## Out of Scope

- Backend API changes (covered by existing `/api/export`)
- Keyboard shortcuts for toggling mode (can be added later)
- Persisting mode preference
