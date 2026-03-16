---
title: Dashboard reskin to match Reactotron desktop visual identity using centralized Chakra theme
category: ui-bugs
date: 2026-03-16
tags: [chakra-ui, theming, dark-mode, color-palette, fonts, reactotron, dashboard, design-system, base16-twilight]
component: Web dashboard (React + Chakra UI v2 + Vite)
severity: low
---

# Dashboard Reskin: Chakra UI v2 Base16 Twilight Theme

## Problem

The web dashboard used Chakra UI's default dark theme (gray scale + cyan accents) and didn't match the Reactotron desktop client's visual identity. Users familiar with Reactotron desktop got no visual recognition. Additionally, all styling was inline Chakra props with 25+ repeated panel patterns, 6+ repeated button patterns, and 60+ scattered color references — making any visual change a large, error-prone effort.

## Root Cause

No centralized theme file existed. The `extendTheme()` call in `main.tsx` only set `initialColorMode: 'dark'` and a body background. Every color, border, hover state, and font reference was hardcoded as inline Chakra props across 7 component files. The dashboard used `cyan` as primary accent instead of Reactotron's burnt orange (`#cf6a4c`), and Chakra's default gray scale instead of the Base16 Twilight palette.

## Solution

### Step 1: Create centralized theme file

Created `dashboard/src/theme.ts` with `extendTheme()` containing:

**Global gray scale override** (highest-leverage change — auto-mapped all 60+ existing `gray.*` references):

```ts
colors: {
  gray: {
    50:  '#e8e8e8',
    100: '#c3c3c3', // base06 — light foreground
    200: '#a7a7a7', // base05 — default foreground
    300: '#838184', // base04 — secondary text
    400: '#5f5a60', // base03 — muted text
    500: '#464b50', // base02 — selection/highlight
    600: '#3a3d40', // interpolated
    700: '#2d2f31', // line — borders
    800: '#252525', // chromeLine — subtle borders
    900: '#1f1f1f', // backgroundSubtleLight — panels
    950: '#1b1b1b', // backgroundDarker — nested cards
  },
}
```

**Custom color scales** for `colorScheme` usage:

```ts
reactotron: {  // burnt orange, 50-900 around #cf6a4c
  50: '#fef2ee', 100: '#fce0d6', 200: '#f5b9a6',
  300: '#e89176', 400: '#d97e5e', 500: '#cf6a4c',
  600: '#b85a3e', 700: '#9e4a33', 800: '#833d2a', 900: '#6a3122',
},
twilightPurple: {  // muted purple, 50-900 around #9b859d
  50: '#f5f0f5', 100: '#e8dee8', 200: '#d1bdd1',
  300: '#b9a0ba', 400: '#a790a8', 500: '#9b859d',
  600: '#87728a', 700: '#725f74', 800: '#5d4d5f', 900: '#4a3d4b',
},
```

**Named accent colors** for one-off usage:

```ts
twilight: {
  amber: '#cda869',   // base09
  green: '#8f9d6a',   // base0B
  blue:  '#7587a6',   // base0D
  steel: '#afc4db',   // base0C
  yellow: '#f9ee98',  // base0A
  warning: '#9b703f', // base0F
},
```

**Button variant** centralizing 6x repeated pattern:

```ts
Button: defineStyleConfig({
  variants: {
    subtle: {
      bg: 'transparent',
      color: 'gray.200',
      borderWidth: '1px',
      borderColor: 'gray.600',
      _hover: { color: 'gray.50', bg: 'gray.700' },
    },
  },
}),
```

**Font + global styles:**

```ts
fonts: { mono: "'Fira Code', SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
styles: { global: {
  body: { bg: '#151515', color: 'gray.100' },
  'code, pre, kbd, samp': { fontVariantLigatures: 'none' },
}},
```

### Step 2: Add Fira Code font

Added Google Fonts preconnect + stylesheet import in `dashboard/index.html` for weights 400, 500, 600, 700.

### Step 3: Update components

- Replaced `colorScheme="cyan"` with `"reactotron"` (Tabs, Buttons, Checkboxes, Badges)
- Replaced `purple.*` with `twilightPurple.*` for Session B identity
- Replaced `cyan.*` accent colors with `reactotron.*` or `twilight.*` named accents
- Replaced 6x inline outline button pattern with `variant="subtle"`
- Replaced gradient background with flat `bg="#151515"`
- Kept semantic colors (red/green/yellow/orange) for errors/warnings/success

### Key Insight

Overriding Chakra's `colors.gray` globally is the highest-leverage change. All 60+ `gray.*` references auto-mapped to Twilight values without touching individual components. Only accent colors (cyan, purple, blue) needed explicit replacement.

## Prevention Strategies

### Theme-First Development

- **No raw color values in component files.** Every color must come from `theme.ts`.
- **If a pattern repeats 3+ times, extract it as a theme variant.** The `subtle` button variant is the model.
- **Use `colorScheme` over ad-hoc color props.** Chakra auto-generates hover/active/disabled states from a single scale.
- **Override built-in Chakra scales globally** (like `gray`) rather than changing individual component props.

### Enforcement

- Grep CI check for hex/rgb values in `dashboard/src/components/` files
- Visual regression tests via Playwright for key views (session tree, detail, compare)
- Code review checklist: no new inline colors, repeated patterns extracted to theme

## Cross-References

- **Brainstorm:** `docs/brainstorms/2026-03-16-dashboard-reskin-brainstorm.md`
- **Plan:** `docs/plans/2026-03-16-feat-dashboard-reactotron-reskin-plan.md`
- **Issue:** [#7 — Redesign web dashboard to match Reactotron desktop look and feel](https://github.com/micheleb/reactotron-llm/issues/7)
- **PR:** [#22 — feat(dashboard): reskin with Reactotron Twilight palette](https://github.com/micheleb/reactotron-llm/pull/22)
- **Upstream source:** [Reactotron theme source](https://github.com/infinitered/reactotron/blob/master/lib/reactotron-core-ui/src/themes.ts)
- **Related plans:** `docs/plans/2026-03-06-feat-historical-log-browser-plan.md` (introduced the components), `docs/plans/2026-03-09-feat-session-tracking-metadata-plan.md` (added Session Compare A/B colors)
