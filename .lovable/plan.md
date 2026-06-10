# Fix: gold accents + logo tile vanish after hydration

## Root cause

`src/components/app-sidebar.tsx` overrides the global `--primary` CSS variable on mount:

```ts
document.documentElement.style.setProperty("--primary", hexToHsl(org.accent_color));
```

The project's `src/styles.css` defines `--primary` in **oklch** format (Tailwind v4 / shadcn). Writing an HSL triplet (`"45 71% 47%"`) into it produces an invalid color value, so every utility that consumes `--primary` — `bg-primary`, `text-primary`, `border-primary`, checkbox `data-[state=checked]:bg-primary`, the logo tile's `bg-primary`, the active-nav gold rail, KPI gold tints — falls back to transparent.

This matches the user's report exactly: gold shows for a frame on first paint (CSS token is valid), then the effect runs once `useOrganization` resolves and the token becomes invalid. Refresh shows gold briefly, then it disappears.

The logo "disappearing" is the same bug — `org.logo_url` is `null` in the DB, so the default `<Cloud />` mark on a `bg-primary` tile is what should render; the tile just goes invisible when `--primary` breaks.

## Changes

1. **`src/components/app-sidebar.tsx`** — Remove the `useEffect` that writes to `--primary` and remove the now-unused `hexToHsl` helper. The gold brand token (`#C9A227`) lives in `src/styles.css` and is the source of truth (per project memory).

2. **Future-proofing for sub-agency white-label accent colors (no code change this turn):** if/when a sub-agency needs a custom accent, it should write to a *separate* token like `--brand-accent` (not `--primary`) and convert hex → `oklch(...)` properly. Out of scope for this fix; flagged as a follow-up.

No DB changes. No changes to `styles.css`, the logo asset, or any other component.

## Verification

- Reload `/contracting/invite` → gold checkboxes (`data-[state=checked]:bg-primary`), gold "Invite As" selected card border (`border-primary bg-primary/5`), and gold "White Label" pill stay gold after hydration.
- Sidebar logo tile is the gold square with the `Cloud` icon again.
- Active sidebar item keeps its gold left rail and gold icon.
- Dashboard KPIs, gold buttons, and gold status pills across the app render correctly and don't flicker.
