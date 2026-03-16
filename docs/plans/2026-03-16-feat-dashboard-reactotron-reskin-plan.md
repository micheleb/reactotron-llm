---
title: "Dashboard Reactotron Reskin"
type: feat
date: 2026-03-16
---

# Dashboard Reactotron Reskin

## Overview

Re-theme the web dashboard to match the Reactotron desktop client's visual identity. This means applying the Base16 "Twilight" color palette, switching to Fira Code as the monospace font, and improving text hierarchy — while keeping the current layout structure (tabs, cards, filter bar, session tree) and staying on Chakra UI v2.

**Brainstorm:** [`docs/brainstorms/2026-03-16-dashboard-reskin-brainstorm.md`](../brainstorms/2026-03-16-dashboard-reskin-brainstorm.md)
**Issue:** [#7](https://github.com/micheleb/reactotron-llm/issues/7)

## Problem Statement / Motivation

The dashboard currently uses Chakra UI's default dark theme (gray scale + cyan accents). Users familiar with the Reactotron desktop app don't get visual recognition. The Reactotron desktop uses the Base16 "Twilight" palette — dark code-editor backgrounds, burnt orange accents, amber data highlights — which is its distinctive visual signature. Matching this palette creates immediate familiarity.

## Proposed Solution

A three-phase approach: (1) create a centralized Chakra theme with Twilight tokens, (2) update components to use theme tokens, (3) add Fira Code font and tune typography.

---

## Color Token Map

### Reactotron Twilight Palette (from `lib/reactotron-core-ui/src/themes.ts`)

The full Base16 Twilight scheme used by Reactotron desktop:

| Base16 | Hex | Role |
|--------|-----|------|
| base00 | `#1e1e1e` | Default background |
| base01 | `#323537` | Lighter background (inactive tabs, panel surfaces) |
| base02 | `#464b50` | Selection background, highlights |
| base03 | `#5f5a60` | Comments, invisibles |
| base04 | `#838184` | Dark foreground (secondary text) |
| base05 | `#a7a7a7` | Default foreground (body text) |
| base06 | `#c3c3c3` | Light foreground (emphasized text) |
| base07 | `#ffffff` | Lightest foreground |
| base08 | `#cf6a4c` | **Primary accent** — burnt orange (tags, actions, errors) |
| base09 | `#cda869` | Amber — numbers, constants, active tabs |
| base0A | `#f9ee98` | Pale yellow — bold/emphasis values |
| base0B | `#8f9d6a` | Olive green — strings, additions |
| base0C | `#afc4db` | Light steel blue — support tokens |
| base0D | `#7587a6` | Blue-grey — headings |
| base0E | `#9b859d` | Muted purple — keywords |
| base0F | `#9b703f` | Dark amber — warnings, deprecated |

### Additional Reactotron theme tokens

| Token | Hex | Role |
|-------|-----|------|
| backgroundSubtleDark | `#151515` | Deepest inset (sidebar, search) |
| backgroundDarker | `#1b1b1b` | Error blocks, deeper panels |
| backgroundSubtleLight | `#1f1f1f` | Header bg, open items, tooltips |
| chromeLine | `#252525` | Borders, separators |
| line | `#2d2f31` | Row separators |
| subtleLine | `#282a2b` | Subtle separators |
| tagComplement | `#f5d5cc` | Text on accent background |

### Chakra Gray Scale Override

Map Chakra's gray stops to Twilight-derived values:

| Chakra Token | Twilight Value | Source |
|-------------|---------------|--------|
| `gray.50` | `#e8e8e8` | Near-white (rarely used in dark mode) |
| `gray.100` | `#c3c3c3` | base06 — light foreground |
| `gray.200` | `#a7a7a7` | base05 — default foreground |
| `gray.300` | `#838184` | base04 — secondary text |
| `gray.400` | `#5f5a60` | base03 — muted text |
| `gray.500` | `#464b50` | base02 — selection/highlight |
| `gray.600` | `#3a3d40` | Interpolated between base01 and base02 |
| `gray.700` | `#2d2f31` | line — borders |
| `gray.800` | `#252525` | chromeLine — subtle borders |
| `gray.900` | `#1f1f1f` | backgroundSubtleLight — panels |
| `gray.950` | `#1b1b1b` | backgroundDarker — nested cards |

Body background: `#151515` (backgroundSubtleDark — deepest shade, replaces `#070b16`).

### Accent Color Mapping

| Current Chakra | Replacement | Rationale |
|----------------|-------------|-----------|
| `cyan.*` (primary accent) | `#cf6a4c` / burnt orange scale | Reactotron's signature `tag` color |
| `purple.*` (Session B) | `#9b859d` / muted purple scale | Twilight `keyword` (base0E) |
| Keep `red`, `green`, `yellow`, `orange` colorSchemes | Muted Twilight-adjacent variants | Preserve semantic meaning for errors/warnings/success |

### Semantic Tokens to Define

```
panel-bg         → gray.900  (#1f1f1f)
panel-border     → gray.700  (#2d2f31)
card-bg          → gray.950  (#1b1b1b)
text-primary     → gray.100  (#c3c3c3)
text-secondary   → gray.200  (#a7a7a7)
text-muted       → gray.300  (#838184)
text-faint       → gray.400  (#5f5a60)
accent-primary   → burnt orange (#cf6a4c)
accent-secondary → amber (#cda869)
heading          → blue-grey (#7587a6)
```

---

## Technical Approach

### Phase 1: Theme Foundation

Create a dedicated theme file and centralize repeated patterns.

**Tasks:**

- [x] Create `dashboard/src/theme.ts` with `extendTheme()` containing:
  - Custom `colors.gray` scale (override Chakra defaults with Twilight values)
  - Custom `colors.reactotron` scale (burnt orange 50-900, for `colorScheme` usage)
  - Custom `colors.twilight` named colors for the remaining accents
  - ~~`semanticTokens.colors`~~ (skipped — gray override makes semantic tokens redundant for now)
  - `fonts` config: `mono: "'Fira Code', SFMono-Regular, Menlo, monospace"` (body/heading stay system sans)
  - `styles.global`: body bg `#151515`, disable Fira Code ligatures on mono elements
  - `config`: keep `initialColorMode: 'dark'`
- [x] Define a `Button` variant `"subtle"` in the theme for the 6x repeated outline button pattern
- [x] Define `Tabs` default `colorScheme` override to use burnt orange instead of cyan
- [x] Update `dashboard/src/main.tsx` to import theme from `./theme` instead of inline `extendTheme()`
- [x] Add Fira Code font link to `dashboard/index.html`:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap" rel="stylesheet">
  ```

**Files:** `dashboard/src/theme.ts` (new), `dashboard/src/main.tsx`, `dashboard/index.html`

### Phase 2: Component Updates

Update each component to use semantic tokens and new palette. Since we're overriding Chakra's gray scale globally, most `gray.*` references will automatically map to Twilight values. The main changes are accent colors and explicit non-gray references.

**Tasks per component:**

#### `App.tsx`
- [x] Remove `bgGradient` on root Box → replace with flat `bg="#151515"`
- [x] Replace `colorScheme="cyan"` on Tabs → `colorScheme="reactotron"`
- [x] Replace `colorScheme="blue"` / `"teal"` on action buttons → `colorScheme="reactotron"`
- [x] WS status Badge colorSchemes kept as-is (green/yellow/red — semantic)

#### `EventCard.tsx`
- [x] Replace left-border accent colors: `red.400` kept for errors, `cyan.400` → `reactotron.400`, `blue.400` → `twilight.blue`
- [x] Replace `cyan.700` timestamp badge bg → `reactotron.700`
- [x] Replace `orange.300` action label → `twilight.amber`
- [x] Replace `cyan.300` network text → `twilight.steel`

#### `FilterBar.tsx`
- [x] Replace outline button with `variant="subtle"`
- [x] Select/Input controls auto-updated via gray scale override

#### `SessionTree.tsx`
- [x] Replace `cyan.400` spinner → `reactotron.400`
- [x] Replace `cyan.500`/`cyan.600` selected/hover borders → `reactotron.500`/`reactotron.600`
- [x] Replace `colorScheme="cyan"` on checkboxes → `"reactotron"`
- [x] Replace outline button with `variant="subtle"`
- [x] Bookmark star colors (yellow.400/300/gray.600) unchanged — work with new palette

#### `SessionDetail.tsx`
- [x] Replace `cyan.400` spinner → `reactotron.400`
- [x] Replace `colorScheme="cyan"` on Compare button → `"reactotron"`
- [x] Replace `cyan.300` latency values → `reactotron.300`
- [x] Replace outline button with `variant="subtle"`
- [x] Replace `colorScheme="purple"` platform badge → `"twilightPurple"`

#### `SessionCompare.tsx`
- [x] Update Session A identity: `cyan.*` → `reactotron.*`
- [x] Update Session B identity: `purple.*` → `twilightPurple.*`
- [x] Replace `cyan.400` spinner → `reactotron.400`
- [x] Replace outline button with `variant="subtle"`

**Files:** All 6 component files in `dashboard/src/components/` + `dashboard/src/App.tsx`

### Phase 3: Typography Tuning

- [x] Verify `fontFamily="mono"` resolves to Fira Code throughout (works via theme `fonts.mono`)
- [x] Review font size hierarchy: headings (`size="lg"/"md"/"sm"`), body (`fontSize="sm"`), metadata (`fontSize="xs"`) — unchanged, hierarchy preserved
- [x] Ensure `fontWeight` values (700, 600, 500) are included in the Fira Code Google Fonts import
- [ ] Test fallback rendering with Fira Code blocked (should gracefully fall back to SFMono/Menlo)
- [ ] Check for layout overflow issues caused by Fira Code's slightly wider glyphs in tight areas (timestamps, filter selects, URL display)

**Files:** Likely no new changes — Phase 1 theme config + Phase 2 component updates handle this

### Phase 4: Verification

- [x] Run existing Playwright tests (`bun run test:dashboard`) — all 20 pass, full suite 79/79 pass
- [ ] Take before/after screenshots using Playwright for visual comparison
- [ ] Spot-check WCAG AA contrast ratios for key combinations:
  - `#a7a7a7` (body text) on `#1e1e1e` → ~5.4:1 ✓
  - `#838184` (secondary text) on `#1e1e1e` → ~3.7:1 ⚠️ (passes for large text only)
  - `#cf6a4c` (burnt orange) on `#1e1e1e` → ~4.7:1 ✓
  - `#8f9d6a` (olive green) on `#1e1e1e` → ~4.1:1 ⚠️ (borderline, use sparingly for small text)
  - `#7587a6` (blue-grey) on `#1e1e1e` → ~4.0:1 ⚠️ (borderline, use for headings/large text)
  - `#cda869` (amber) on `#1e1e1e` → ~5.8:1 ✓
- [ ] If `gray.300` (`#838184`) fails AA for small text, bump it to a lighter value (~`#908d90`)

## Acceptance Criteria

- [ ] Dashboard uses Reactotron Twilight color palette (dark backgrounds ~`#1e1e1e`, burnt orange accents)
- [ ] Fira Code is the monospace font (with ligatures disabled)
- [ ] System sans-serif remains the body/heading font
- [ ] All existing features work identically (no layout or functional changes)
- [ ] No new Chakra colorSchemes are broken (badges, buttons, tabs render correctly)
- [ ] Event type left-border colors remain visually distinct
- [ ] Session Compare A/B colors remain distinguishable
- [ ] Repeated panel pattern is centralized (no more 25x inline `borderColor="gray.700" bg="gray.900"`)
- [ ] Repeated outline button pattern is a theme variant
- [ ] Existing Playwright tests pass
- [ ] Primary text passes WCAG AA contrast (4.5:1) on panel backgrounds

## Dependencies & Risks

**Dependencies:**
- Google Fonts CDN for Fira Code (external dependency, acceptable for a dev tool)

**Risks:**
- **Gray scale override is global** — affects all Chakra components including those using implicit gray (Select, Input, Modal, Tooltip). Need to visually verify form controls.
- **Fira Code wider glyphs** — may cause minor overflow in timestamp badges or filter selects. Mitigate by testing tight areas.
- **Borderline contrast for `gray.300`/`gray.400`** — secondary/muted text may need lightening to meet AA. Address in Phase 4.

## References

- [Reactotron theme source](https://github.com/infinitered/reactotron/blob/master/lib/reactotron-core-ui/src/themes.ts)
- [Base16 Twilight palette](https://github.com/chriskempson/base16)
- Brainstorm: `docs/brainstorms/2026-03-16-dashboard-reskin-brainstorm.md`
- Current theme: `dashboard/src/main.tsx:6-22`
- Dashboard components: `dashboard/src/components/*.tsx`
