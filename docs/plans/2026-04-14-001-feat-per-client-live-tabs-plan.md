---
title: Per-client live tabs with activity indicators
type: feat
status: active
date: 2026-04-14
---

# Per-client live tabs with activity indicators

## Overview

Replace the static `Live | History` top-level tab strip with a dynamic strip:

- **Tab 1 — `Browse Sessions`** (the renamed History tab; not default-selected)
- **Tab 2..N — one per currently-connected app client** — each labeled with the app's own name (from `client.intro`), prefixed by a platform icon (Apple/Android), with a pulsating activity dot and a close button
- When **no client is connected**, Tab 2 is a placeholder `Live`

Each per-client tab filters the event firehose to that one session and owns its own state-snapshot panel, filter state, and per-session actions (Refresh, Export, Dump State). Global-scope `Reset Logs` is moved out of the live area and lives only inside `Browse Sessions`.

## Problem Statement / Motivation

Today the dashboard mixes events from every connected client into one stream and surfaces multi-client state only as a number (`App Clients: N`). With even two emulators running, you can't tell whose events are whose, can't dump just one client's state, and can't see whether a connected device has gone idle. The original Reactotron desktop solves this with a per-client tab strip; we don't.

The same UI also gives a natural home for surfacing **liveness** (last-activity dot) without a separate stale-detection feature, and lets the destructive global `Reset Logs` move to a less-trigger-happy location.

## Proposed Solution

### Tab strip

When clients are connected (N ≥ 1):

```
[ Browse Sessions ]  [  MyApp ● ✕ ]  [  OtherApp ● ✕ ]
     index 0            index 1          index 2
```

When zero clients are connected:

```
[ Browse Sessions ]  [ Live ]
     index 0          index 1 (placeholder, default-selected)
```

- **`Browse Sessions`**: the existing History UI (session list / detail / compare). Hosts the global **Reset Logs** button. Never default-selected.
- **Per-client tab**: one per live `appClient` (keyed by `sessionId`). Each renders a scoped Live view: filtered event stream, per-tab `useEventFilter` state, per-tab state snapshot, per-tab actions (Refresh, Export, Dump State).
- **`Live` placeholder**: shown only when zero clients are connected. Renders the connection-troubleshooting panel from issue #10 — heading "Waiting for a client to connect…", the proxy port + WS URL pulled from `/health`, then a section of platform-specific tips:
  - **Android physical device**: `adb reverse tcp:9090 tcp:9090` shown in a `<Code>` block with a `<CopyButton>` (reuse `dashboard/src/components/CopyButton.tsx`)
  - **Android emulator**: use `10.0.2.2` instead of `localhost` as the Reactotron host
  - **iOS simulator**: `localhost` should work; check firewall if not
  - **General**: confirm the app's `Reactotron.configure({ host, port })` matches the values shown above
  - Link to README at the bottom

  As soon as the first WS opens, this tab is removed from the strip and the new client tab takes its place; selection follows. (Implementing this panel **closes issue #10**.)

### Reconnect identity

Every WS open mints a fresh `sessionId` → fresh tab. A previous tab for the same physical device (kill + restart) stays as a greyed-out tab; the user can manually close it.

### Activity dot

Server pushes `lastSeen` (ISO string) per client; updated on every ingested event. A single 10s `setInterval` on the dashboard recolors all dots via `dotState(client, now)`:

- `now − lastSeen ≤ 60s`: green
- `≤ 1h`: orange
- `> 1h`: grey
- `client.isOpen === false`: grey ring (no fill) — overrides the time-based color

The dot is **solid** in its current color most of the time. It **pulses briefly (~400ms) on each incoming event** for that client — a visible heartbeat each time something new arrives, instead of a continuous animation. Implementation: `<ClientTab>` watches its client's `lastSeen`; when it changes, it toggles a `data-pulse="true"` attribute that triggers a one-shot CSS keyframe via `animationend`.

`now` is the dashboard's `Date.now()`; `lastSeen` is server-issued. Browser/server clock skew is acceptable here because we don't need second-precision — boundaries are at 60s and 3600s. No NTP-style correction needed.

`prefers-reduced-motion` disables the on-event pulse — the dot still recolors, just doesn't animate.

### Default selection

| State | Default-selected tab |
|-------|----------------------|
| 0 clients | `Live` placeholder (index 1) |
| ≥ 1 client | leftmost client tab (index 1) |
| User on placeholder when 1st client connects | tab transforms in place; selection follows |
| User on tab X when client Y connects | no auto-switch (stays on X) |
| User on tab X when X's client disconnects | stays on X (events still browsable) |
| User clicks ✕ on active tab | focus moves to left neighbor (or `Browse Sessions` if none) |

`Browse Sessions` is never auto-selected.

### Per-tab actions

Per-client tab toolbar:

| Button | Scope | Endpoint |
|--------|-------|----------|
| Refresh Events | this client's session | `GET /api/sessions/:id/events` |
| Export | this client's session | `GET /api/export?session=<id>` (already supported) |
| Dump State | this client | `GET /dump-state?session=<id>` (new query param) |

Global action: **Reset Logs** moves to the `Browse Sessions` tab toolbar (calls `POST /api/events/reset` unchanged; existing confirmation modal kept verbatim).

## Acceptance Criteria

- [ ] `Browse Sessions` tab appears at index 0 and is never the default-selected tab on first mount
- [ ] When zero app clients are connected, a `Live` placeholder tab exists at index 1 and is default-selected
- [ ] When N app clients are connected, N tabs exist at indices 1..N (no `Live` placeholder); leftmost is default-selected on first mount
- [ ] Each per-client tab shows: platform icon (Apple/Android/unknown fallback), app name from `client.intro`, activity dot, close button
- [ ] Activity dot color reflects time since last activity: green ≤60s, orange ≤1h, grey >1h, ring (no fill) when disconnected
- [ ] Activity dot is solid by default and pulses for ~400ms each time a new event arrives for that client; `prefers-reduced-motion` suppresses the pulse
- [ ] Tab close button removes the tab from the strip locally; same client reconnecting does NOT reopen the closed tab unless a new WS connection arrives (which mints a new sessionId)
- [ ] When a client disconnects, its tab stays open with a grey-ring dot and remains the active tab if it was active
- [ ] Per-client tab event stream contains only that session's events (verified for both live broadcasts and historical backfill on dashboard mount/refresh)
- [ ] Per-tab `useEventFilter` state — switching tabs preserves each tab's filter selections
- [ ] State Snapshot panel is per-tab; Dump State targets only that tab's client; in-flight Dump State responses route to their originating tab regardless of active tab at response time
- [ ] Reset Logs button lives only in `Browse Sessions`; the existing confirmation modal copy is unchanged
- [ ] Anonymous clients (no `client.intro` ever received) display as `Unnamed (<8-char sessionId>)`
- [ ] Dashboard WS reconnect repopulates the tab strip via a `clients-snapshot` server message; selection state is preserved if the previously-selected client is still connected, else falls back per the rules above
- [ ] `prefers-reduced-motion` disables the green pulse; static dots remain
- [ ] All existing Playwright specs continue to pass after selector updates (see Test Plan)

## Technical Approach

### Shared types — `src/shared/types.ts`

Add transport types for new dashboard-WS message kinds:

```ts
export type ClientInfo = {
  clientId: string          // == sessionId; renamed clientId at the API boundary
  connectedAt: string
  lastSeen: string          // ISO; updated on every ingested event
  isOpen: boolean           // false once onClose fires
  appName?: string          // from client.intro
  platform?: string         // from client.intro
}

export type DashboardMessage =
  | { kind: 'hello'; clientId: string; connectedAt: string }
  | { kind: 'clients-snapshot'; clients: ClientInfo[] }
  | { kind: 'client-connected'; client: ClientInfo }
  | { kind: 'client-updated'; client: ClientInfo }
  | { kind: 'client-disconnected'; clientId: string; disconnectedAt: string }
  | { kind: 'event'; clientId: string; event: CuratedEvent }   // envelope-wrapped
  | { kind: 'state-updated'; clientId: string; capturedAt: string }
  | { kind: 'events-reset'; at: string }
```

`CuratedEvent` itself stays unchanged — `clientId` rides on the envelope, not the curated payload. This keeps `/api/events`, copy-paste markdown, and other downstream consumers untouched.

### Server — `src/index.ts`

1. **Fix the `wsBehavior` closure bug.** `let sessionId = ''` at line 145 is shared across all clients (`upgradeWebSocket` is called once at line 246). Refactor: drop the closure variable; always read `ws.data.sessionId` from the argument. **Blocks per-client routing — must land first or in the same PR.**

2. **In-memory client registry.** Add `const clientRegistry = new Map<string, ClientInfo>()`. Lives in process memory only; lost on server restart (acceptable — restart kicks every WS anyway, dashboards reseed via the snapshot on reconnect). Update on:
   - `onOpen`: insert with `appName`/`platform` undefined, `lastSeen = now`, `isOpen = true`. Broadcast `client-connected`.
   - `onMessage` for `client.intro`: patch in `appName`/`platform`. Broadcast `client-updated`.
   - `onMessage` for any event: bump `lastSeen`. Broadcast `client-updated` at most once per second per client (in-memory throttle by `clientId`) so the dashboard WS isn't flooded; the dot only needs second-precision.
   - `onClose`: set `isOpen = false`. Broadcast `client-disconnected`. Keep the entry around for now — frontend decides closure timing.

3. **Envelope events with `clientId`.** Change `broadcastDashboard({ kind: 'event', event: curated })` (line 190) to `broadcastDashboard({ kind: 'event', clientId: ws.data.sessionId, event: curated })`.

4. **Dashboard-WS open snapshot.** In the dashboard WS `open` handler (line 587), after the existing `hello` send, also send `{ kind: 'clients-snapshot', clients: [...clientRegistry.values()] }`. Idempotent and cheap.

5. **Per-client state snapshot.** Replace global `latestState`/`latestStateAt` with `latestStatePerClient = new Map<string, { state: unknown; at: string }>`. Update inside `onMessage` from `inferState` keyed by `ws.data.sessionId`. Keep the global vars as a fallback (whichever client most recently produced state) so unmodified `/api/state` callers still work.

6. **`/dump-state?session=<id>`.** Accept a session query param. When set, only send the state-request messages to the matching `ws` in `appClients` and broadcast `{ kind: 'state-updated', clientId, capturedAt }` instead of the existing global one. Without the param, behave as today (broadcast to all, last writer wins).

7. **`/api/sessions/:id/events`** already exists per repo research — used by the dashboard for per-tab Refresh.

### Dashboard — `dashboard/src/App.tsx`

The per-client tab implementation requires extracting today's Live view into a child component first; doing this on top of the existing 540-line `App.tsx` would be unmaintainable.

#### `dashboard/src/components/LiveClientView.tsx` (new)

Extracted from current Live-tab JSX in `App.tsx`. Props:

```tsx
type Props = {
  apiBase: string
  client: ClientInfo            // never null — placeholder is a separate component
  events: CuratedEvent[]        // already filtered to this client's events
  onDumpState: () => void
  onRefresh: () => void
}
```

Owns its own `useEventFilter`, state-snapshot panel, and per-client toolbar (Refresh / Dump / Export / Copy All). `clientId` is read from `client.clientId`; no separate prop.

#### `dashboard/src/components/LivePlaceholderView.tsx` (new)

Empty-state component shown only when no clients are connected. Reads `apiBase` + `health` and renders connect-instructions. Kept separate from `LiveClientView` so neither has nullable prop branches.

#### `dashboard/src/components/TabBar.tsx` (new)

Renders the strip:

```tsx
<TabBar
  selectedTabId={selectedTabId}            // 'browse' | 'live' | clientId
  clients={clients}                        // ClientInfo[] from WS
  now={now}                                // tick from useNowTick(10_000)
  onSelect={(id) => setSelectedTabId(id)}
  onClose={(clientId) => closeClientTab(clientId)}
/>
```

Each per-client tab is a small component (`<ClientTab>`) rendering the icon + label + activity dot + close button. Add testids: `tab-browse-sessions`, `tab-live-placeholder`, `tab-client-<clientId>`, `tab-close-<clientId>`, `activity-dot-<clientId>`.

#### `dashboard/src/hooks/useClientRegistry.ts` (new)

```ts
export function useClientRegistry(wsUrl: string): {
  clients: ClientInfo[]
  isConnected: boolean
}
```

Subscribes to the dashboard WS (extracted from the existing effect). Reduces `client-connected` / `client-updated` / `client-disconnected` / `clients-snapshot` into a `Map<clientId, ClientInfo>`. Exposes ordered `clients` (by `connectedAt` ASC).

#### `dashboard/src/hooks/useNowTick.ts` (new)

```ts
export function useNowTick(intervalMs: number): number  // returns Date.now(), refreshes every intervalMs
```

A single ticker drives all dot recoloring — N tabs share one timer.

#### `dashboard/src/utils/activityDot.ts` (new)

```ts
export type DotState = 'green' | 'orange' | 'grey' | 'disconnected'
export function dotState(client: ClientInfo, now: number): DotState
```

Pure function. Centralized so tests can lock the time/lastSeen boundaries.

#### `dashboard/src/utils/platformIcon.tsx` (new)

Inline SVG components for `<AppleIcon />` and `<AndroidIcon />` (no new dependency) plus `<UnknownPlatformIcon />`. Wrapped in Chakra `<Icon>` so they pick up theme tokens.

#### `dashboard/src/App.tsx` changes

- Replace `viewState` 4-variant union with two pieces of state:
  - `selectedTabId: 'browse' | 'live' | string` (string = clientId)
  - `closedClientIds: Set<string>` (locally hidden tabs)
- Drive tab list as: `[browse, ...connectedClients.filter(c => !closedClientIds.has(c.clientId))]` — when that's just `[browse]`, append `live` placeholder.
- Per-tab event partition: maintain `eventsByClient: Map<clientId, CuratedEvent[]>`. On `kind: 'event'` push into `eventsByClient.get(parsed.clientId)`. On `clients-snapshot` initial mount, fire `/api/sessions/:id/events` for each connected client to backfill (parallel; small N expected). Drop the existing flat `events` state for the live tabs (keep it only for the placeholder when no clients have ever connected).
- Move Reset Logs button + AlertDialog out of the live toolbar; render only when `selectedTabId === 'browse'`.

### Tests — Playwright

Add `data-testid`s from day one (per learnings doc):
- `data-testid="tab-browse-sessions"`
- `data-testid="tab-live-placeholder"`
- `data-testid="tab-client-<clientId>"`
- `data-testid="tab-close-<clientId>"`
- `data-testid="activity-dot-<clientId>"` with `data-state="green|orange|grey|disconnected"`

Update existing selectors:
- `tests/dashboard.spec.ts`: `getByRole('tab', { name: 'Live' })` → `getByTestId('tab-live-placeholder')`. `name: 'History'` → `getByTestId('tab-browse-sessions')`. The "Reset Logs button visible/hidden on Live/History tab" tests need their assertions inverted (Reset Logs now lives only on Browse Sessions).
- `tests/history.spec.ts`: same selector swap; "Live and History tabs are visible" updated to "Browse Sessions and Live placeholder are visible when no clients connected".
- `tests/copy-paste.spec.ts`, `tests/export.spec.ts`: tab-name selectors → testid lookups; Export tests need to assert `?session=<id>` is appended when triggered from a per-client tab.
- New spec `tests/per-client-tabs.spec.ts` (serialized via project dependencies, per the copy-paste pattern that prevented parallel interference): seed `client.intro`, assert tab appears with app name + Apple icon + `activity-dot` `data-state="green"`; send another event and assert `data-pulse` toggles briefly; close tab and verify it disappears; reconnect (new WS) → new tab appears alongside; two concurrent intros → two tabs with correct names.
- For dot color transitions, prefer testing the pure `dotState(client, now)` function via a Playwright `evaluate()` block that imports it from the bundle and asserts boundary outputs at fixed `now`/`lastSeen` pairs. Avoid mocking real time in the dashboard.

Per repo memory, every test failure after this lands gets investigated, not waved off as pre-existing.

## Phases

### Phase 1 — Foundation (low risk, lands first)
- Fix `wsBehavior` closure bug (`ws.data.sessionId` everywhere).
- Add `clientRegistry` map + `client-connected`/`client-updated`/`client-disconnected`/`clients-snapshot` broadcasts.
- Envelope `clientId` on `kind: 'event'`.
- Update `DashboardMessage` types in `src/shared/types.ts`.
- Dashboard: subscribe to new messages but keep showing the existing single Live tab (no UI change yet).
- **Outcome**: server is multi-client-aware, dashboard receives metadata; everything still renders as today.

### Phase 2 — UI extraction (no behavior change)
- Extract `LiveClientView`, `TabBar`, `useClientRegistry`, `useNowTick`, `activityDot`, `platformIcon`.
- Replace existing Tabs JSX with `TabBar` rendering `Browse Sessions` + single `Live` placeholder. No per-client tabs yet.
- Move Reset Logs into Browse Sessions.
- Update test selectors to testids.

### Phase 3 — Per-client tabs
- Render dynamic per-client tabs from `clientRegistry`.
- Per-tab event partition + `/api/sessions/:id/events` backfill.
- Per-tab `useEventFilter` (one instance per mounted client view).
- Activity dot rendering + 10s `useNowTick`.
- Tab close + closed-id tracking.

### Phase 4 — Per-client state
- Per-client `latestStatePerClient` map on the server.
- `/dump-state?session=<id>` honors the param.
- Per-tab Dump State button + state panel.
- Response routing: `state-updated` carries `clientId`; only the matching tab updates.

### Phase 5 — Test sweep
- New `tests/per-client-tabs.spec.ts`.
- Audit + update all existing tab selectors.
- Verify accessibility (close button keyboard, prefers-reduced-motion).

Each phase ends green. Phase 1 + 2 are landable independently if the rest stalls.

## System-Wide Impact

- **Interaction graph**: app WS `onMessage` → `clientRegistry` update → `broadcastDashboard` → dashboard WS `onmessage` → `useClientRegistry` reducer → React rerender of `TabBar` + selected `LiveClientView`. State snapshot path: `Dump State click` → `GET /dump-state?session=<id>` → server sends `state.values.request` to that one `ws` → app responds → `inferState` updates `latestStatePerClient` → `broadcastDashboard({state-updated, clientId})` → only the tab matching `clientId` reloads its state.
- **Error propagation**: dashboard WS dropouts now leave a stale `clientRegistry` until reconnect; `clients-snapshot` on reopen reseeds it. App-side `onError` is unchanged. `/dump-state?session=<id>` for a missing session returns 404; UI surfaces a toast.
- **State lifecycle risks**: closing a tab only hides it; the underlying `appClient` WS keeps streaming events into `eventsByClient`. Memory grows for hidden tabs unless we also stop appending. Mitigation: when a `clientId` is in `closedClientIds`, drop incoming events for it (events are still in DB; History tab can replay).
- **API surface parity**: `/api/export?session=<id>` already exists; per-tab Export wires it. `/api/events` retains today's flat behavior (used by Browse Sessions + history detail view). `/api/state` (global file) stays as today's "last writer wins" fallback for non-tab consumers. New endpoint behavior: `GET /dump-state?session=<id>`.
- **Integration test scenarios**: (1) two clients connect concurrently — both tabs appear, events route to correct tab; (2) client connects, intro arrives 200ms later — events from that gap end up in the right tab; (3) dashboard WS drops + reconnects with active per-client tab — selection preserved if client still connected; (4) Dump State on tab A, switch to tab B before response — A's state panel updates, B's untouched; (5) close-then-reconnect same physical app — old tab grey, new tab green.

## Edge Cases & Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Same physical client reconnects | New tab; old stays grey | Honest model; matches DB session-per-WS reality |
| Anonymous client (no `client.intro`) | `Unnamed (<8-char sessionId>)` | Always renderable; user can disambiguate |
| Two clients with same name | v1: leave both as plain name; rely on dot color + tab order to disambiguate | YAGNI; rare in dev — revisit if it bites |
| Default selection on initial mount | Leftmost client tab if any, else `Live` placeholder | Browse Sessions never default |
| First connect from `Live` placeholder | Placeholder transforms in place; selection follows | Equivalent to "auto-switch on first connect" without violating "no auto-switch" for subsequent ones |
| Close currently-active tab | Focus left neighbor, else `Browse Sessions` | Standard tab UX |
| Active client disconnects | Stay on tab; dot greys | Final events still browsable |
| Reopen closed tab | Only via new WS connection (new sessionId → new tab) | Closing is durable per local UI; underlying session still exists in History |
| Hidden-tab event memory growth | Drop events for closed clientIds at the dashboard | DB still has them; History replays |
| State for disconnected client | Last-dumped value retained; Dump State button disabled | Read-only after disconnect |
| `prefers-reduced-motion` | No on-event pulse; dots stay solid (still recolor by age) | Accessibility |
| Pulse trigger | One-shot pulse on each new event for that client (not continuous) | Heartbeat semantics — dot signals "event just arrived", not "client is alive" |
| Multi-dashboard | All UI state local; closing a tab in one dashboard does not affect another | Already the architecture |
| Dump State race vs tab switch | Response routes by clientId, not active tab | Avoids cross-tab state leak |
| Filter state per tab | Each `LiveClientView` has its own `useEventFilter` | Matches `SessionDetail` precedent |

## Risks

- **`wsBehavior` closure bug** is a pre-existing latent defect but per-client routing exposes it directly. Must be fixed in Phase 1 or the whole feature reads/writes the wrong session.
- **Test churn**: 4 existing spec files reference `getByRole('tab', { name: ... })`. Repo memory rule prohibits dismissing failures as pre-existing — budget Phase 5 accordingly.
- **State file on disk** (`STATE_PATH`) stays single-file last-writer-wins. If anyone consumes `state.json` outside the dashboard expecting per-client semantics, this breaks them. None known — confirm via grep before landing Phase 4.
- **Event ordering**: `client.intro` may arrive after the first few events (typical Reactotron timing). The tab will exist with placeholder name for a brief window; events route correctly throughout.
- **App.tsx already large.** Phase 2's extraction is a precondition, not optional — attempting Phase 3 without it produces an unreviewable diff.

## MVP

Phase 1 + Phase 2 alone ship a value increment: server emits per-client metadata; dashboard renders it as a single Live tab + Browse Sessions, with Reset Logs relocated. Phase 3 onward delivers the full multi-tab UX.

## Sources & References

### Internal references
- `src/index.ts` — proxy WS handlers (`wsBehavior` lines 144–219, `broadcastDashboard` line 71, `/dump-state` line 261, `/health` line 250)
- `src/shared/types.ts` — `CuratedEvent` (lines 30–60); add `ClientInfo` + `DashboardMessage`
- `src/shared/curate.ts` — `client.intro` extraction (lines 417–437), `inferState` (lines 126–145)
- `src/db.ts` — sessions table already persists `app_name`/`platform`/`client_metadata`
- `dashboard/src/App.tsx` — current `ViewState` (lines 58–62), `tabIndex` (line 109), Tabs JSX (lines 374–392), Live conditional render hotspots (lines 293, 341, 395)
- `dashboard/src/hooks/useEventFilter.ts` — per-tab usage pattern
- `dashboard/src/components/SessionDetail.tsx` — precedent for tab-scoped filters
- `dashboard/src/components/SessionTree.tsx:324-330` — existing dot pattern (reusable for activity dot)
- `dashboard/src/theme.ts` — Chakra theme; pulsation must use theme tokens (per `docs/solutions/ui-bugs/chakra-ui-v2-base16-twilight-theme-reskin.md`)
- `tests/history.spec.ts`, `tests/dashboard.spec.ts`, `tests/copy-paste.spec.ts`, `tests/export.spec.ts` — selectors to update
- `playwright.config.ts:26-65` — projects + dependencies; serialize new spec like copy-paste

### Related plans
- `docs/plans/2026-03-06-feat-historical-log-browser-plan.md` — origin of current Live/History split; some assumptions invalidated here (Reset Logs scope, default tab)
- `docs/plans/2026-03-09-feat-session-tracking-metadata-plan.md` — extended `ViewState`; new variant must coexist with `view: 'compare'`
- `docs/plans/2026-03-17-001-feat-copy-paste-mode-plan.md` — most recent feature; test stability lessons (testids from day one, serialize new spec, use spies)

### Related issues
- [#10 Show connection troubleshooting help when no logs are arriving](https://github.com/micheleb/reactotron-llm/issues/10) — the `Live` placeholder content spec; closed by Phase 2 of this plan

### Institutional learnings applied
- `docs/solutions/ui-bugs/chakra-ui-v2-base16-twilight-theme-reskin.md` — no raw hex/rgb in component files; use theme tokens for the pulsating dot and platform icons
- `~/.claude/projects/-Users-michelebonazza-git-reactotron-llm/memory/feedback_never_dismiss_test_failures.md` — investigate every test failure post-change, don't dismiss as pre-existing

### Gaps worth documenting after implementation lands
- WebSocket lifecycle / multi-client tracking pattern (no prior `docs/solutions/` entry)
- Chakra v2 dynamic tabs gotchas (controlled `index` vs id-keyed selection)
- Per-entity scope refactor (global → per-client) — first true scope-narrowing in this repo
