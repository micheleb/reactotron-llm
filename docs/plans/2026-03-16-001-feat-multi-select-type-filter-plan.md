---
title: "feat: Support multi-select filtering for event types"
type: feat
status: completed
date: 2026-03-16
---

# feat: Support multi-select filtering for event types

The dashboard Type filter currently allows selecting a single type or "All". Users want to filter by multiple types at once (e.g. show only `api.response` and `state.action.complete` together).

Relates to: [#16](https://github.com/micheleb/reactotron-llm/issues/16)

## Key Decisions

- **Data structure:** `Set<string>` for the type filter state — matches the existing codebase pattern (SessionCompare uses `Set<string>` for multi-selection with toggle logic).
- **UI approach:** Custom Popover + CheckboxGroup using Chakra v2 primitives — avoids adding a new dependency (`chakra-react-select` / `react-select`), stays consistent with the dashboard's existing component patterns.
- **"All" semantics:** Empty set = show all events (not "show nothing"). This matches the current behavior where `typeFilter === ''` means "All".
- **Trigger display:** Show "All" when nothing selected; show comma-separated type names when 1-2 types selected; show "N types selected" when 3+ types selected.
- **Shared filter logic:** Extract a `useEventFilter` hook to eliminate the duplicated filtering `useMemo` between App.tsx and SessionDetail.tsx.
- **Server-side:** No changes needed — the export API already supports comma-separated `type` param via `typeParam.split(',')`.

## Acceptance Criteria

- [x] Type filter allows selecting multiple types via a Popover with checkboxes
- [x] Events matching **any** selected type are shown (OR logic); other filters remain AND-combined
- [x] Empty selection shows all events (same as current "All" behavior)
- [x] Trigger button displays: "All" / "log, api.response" (1-2 types) / "3 types selected" (3+)
- [x] Export button passes comma-separated types to the API (e.g. `?type=log,api.response`)
- [x] Reset button clears all selected types back to "All"
- [x] Works identically in both Live view (App.tsx) and History session detail (SessionDetail.tsx)
- [x] Checkbox list includes a "Select All" / "Clear" toggle at the top
- [x] Checkbox list has a max height with scroll for long type lists
- [x] Stale type selections are pruned when the event list is explicitly reset (Reset Logs button)
- [x] All colors use the centralized Twilight theme from `theme.ts` (`colorScheme="reactotron"` for checkboxes)
- [x] Existing Playwright test "Export passes type filter to URL" (`tests/export.spec.ts:168`) is updated for multi-select interaction
- [x] New test: select 2+ types, verify export URL contains comma-separated values
- [x] New test: select types, click Reset, verify filter returns to "All"

## Files to Change

1. **`dashboard/src/hooks/useEventFilter.ts`** (new) — Extract shared filtering logic from App.tsx and SessionDetail.tsx into a reusable hook. Accepts `events`, returns filtered events + filter state + setters + derived `eventTypes`.

2. **`dashboard/src/components/FilterBar.tsx`** — Replace `<Select>` with Popover + CheckboxGroup. Change `typeFilter: string` → `typeFilter: Set<string>`, `onTypeFilterChange: (value: string) => void` → `onTypeFilterChange: (value: Set<string>) => void`.

3. **`dashboard/src/App.tsx`** — Replace inline filter state/logic with `useEventFilter` hook. Update export URL builder to join selected types with commas.

4. **`dashboard/src/components/SessionDetail.tsx`** — Replace inline filter state/logic with `useEventFilter` hook.

5. **`tests/export.spec.ts`** — Update existing single-type test and add multi-type export test.

## Out of Scope

- Export button for SessionDetail (History view) — not part of this feature
- Searchable/filterable checkbox list — not needed for v1 (typically 5-15 distinct types)
- Multi-select for the Level filter — separate enhancement if desired
- Comma escaping in type names — event types are dot-separated identifiers, not free-form text
