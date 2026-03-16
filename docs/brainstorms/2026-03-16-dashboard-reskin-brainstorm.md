# Dashboard Reskin: Reactotron Visual Identity

**Date:** 2026-03-16
**Issue:** [#7 — Redesign web dashboard to match Reactotron desktop look and feel](https://github.com/micheleb/reactotron-llm/issues/7)
**Status:** Brainstorm complete

## What We're Building

A visual reskin of the web dashboard to match the Reactotron desktop client's color scheme and typography, giving existing Reactotron users immediate visual familiarity. The current layout structure (tabs, filter bar, event cards, session tree) stays intact.

### Scope

1. **Chakra UI theme override** — Map Reactotron's color palette into a custom Chakra theme:
   - Dark navy/charcoal backgrounds (replacing current `gray.900`/`gray.950`)
   - Reactotron's signature green as the primary accent (replacing `cyan`)
   - Muted grays for borders, secondary text
   - Appropriate semantic colors for errors (red), warnings (orange), etc.

2. **Typography pass** — Improve font choices and hierarchy across all components:
   - Monospace font for data/code areas (event payloads, JSON, stack traces, network details)
   - Clean sans-serif for UI chrome (labels, buttons, tabs, headers)
   - Refine font sizes, weights, and line heights for better readability
   - Ensure consistent text hierarchy (headings > labels > body > metadata)

### Out of Scope

- Layout restructuring (no sidebar nav, no switching from tabs)
- Spacing/padding overhaul
- New features or components
- Switching away from Chakra UI
- Routing library introduction

## Why This Approach

- **Visual familiarity is the goal**, not a UX overhaul — re-skinning achieves this with minimal risk
- **Chakra's theme system** makes color palette changes straightforward via `extendTheme()`
- **Typography is the highest-impact "minor tweak"** — developer tools live and die by readability
- **Keeping the current layout** avoids scope creep and preserves existing E2E test coverage

## Key Decisions

1. **Keep Chakra UI** — Re-theme rather than migrate. Less effort, no risk.
2. **Color scheme + typography only** — No layout or spacing changes in this pass.
3. **Reactotron green as primary accent** — Replaces current cyan throughout.
4. **Monospace for data, sans-serif for chrome** — Clear visual distinction between UI and content.

## Open Questions

1. **Exact Reactotron color values** — Need to extract the precise hex values from Reactotron desktop's source or screenshots. Key colors: background, accent green, text, borders, status colors.
2. **Font choices** — Which monospace font? Options: system monospace stack, JetBrains Mono, Fira Code, Source Code Pro. Sans-serif: system stack or Inter?
3. **Visual verification** — Use Playwright screenshots or dev-browser to compare before/after. May want to capture baseline screenshots before starting.

## References

- [Reactotron desktop source](https://github.com/infinitered/reactotron) — for extracting color values
- Current theme: `dashboard/src/main.tsx` (Chakra theme config)
- All dashboard components: `dashboard/src/components/`
- Existing Playwright tests: `tests/dashboard.spec.ts`
