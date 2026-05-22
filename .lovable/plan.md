# Fix light/dark theme for navigation (sidebar + topbar)

## Problem

In `src/styles.css`, the `--sidebar*` tokens are hardcoded to dark navy in **both** `:root` (light) and `.dark`. So toggling theme only flips the main content area — the sidebar stays dark navy in light mode, which looks broken next to the white app surface.

The topbar itself is fine (uses `bg-card`, `border-b`), but its border/icon contrast needs a quick check in both modes.

## Changes (CSS-only, no component logic touched)

**`src/styles.css` — light theme (`:root`)**: replace the dark-navy sidebar tokens with a light surface so the sidebar matches the rest of the app in light mode:
- `--sidebar`: near-white tinted (`oklch(0.985 0.005 250)`)
- `--sidebar-foreground`: dark text (`oklch(0.25 0.04 264)`)
- `--sidebar-primary`: keep brand blue
- `--sidebar-primary-foreground`: white
- `--sidebar-accent`: subtle hover (`oklch(0.95 0.02 257)`)
- `--sidebar-accent-foreground`: dark text
- `--sidebar-border`: `oklch(0.92 0.01 257)`
- `--sidebar-ring`: brand blue

**`src/styles.css` — dark theme (`.dark`)**: keep the existing dark sidebar tokens (already correct).

**`src/components/top-bar.tsx`**: change `bg-card` → `bg-background` (matches main surface) and ensure the border uses `border-border` explicitly so contrast is consistent in both themes. Icons already inherit `foreground` via the Button ghost variant — no change needed.

**`src/components/app-sidebar.tsx`**: no logic changes. The header's `bg-primary` brand tile + `text-primary-foreground` already work in both themes.

## Verification

- Toggle theme via the topbar sun/moon button on `/dashboard`.
- Light mode: sidebar = light surface, dark text, blue active state, visible group labels.
- Dark mode: sidebar = dark navy, light text, blue active state.
- Active route highlight readable in both modes.
- Topbar border + icon contrast readable in both modes.

## Out of scope

No new components, no layout changes, no route changes.
