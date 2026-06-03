# Agent Cloud — Gold Re-skin Handoff (for Lovable / Claude)

**Goal:** Re-skin the entire app from the current **blue (`#3B82F6`)** brand to **gold (`#C9A227`)**, and apply two polish passes — **buttons** and **navigation** — across *every* page. This is a theming + component change only. Do **not** change layout, data, routing, or copy.

---

## ✦ PASTE-THIS PROMPT (start here)

> Re-skin this app's brand color from blue (`#3B82F6`) to gold (`#C9A227`) across **every** page and component. Work primarily through design tokens so the change cascades automatically, then sweep for hardcoded blues.
>
> 1. **Update the CSS variables** in `src/styles.css` (`:root` and `.dark`) per the "Token changes" table below. Critically, gold is a *light* color, so `--primary-foreground` must become **dark** (text/icons sitting on gold buttons must be near-black, not white).
> 2. **Sweep for hardcoded blue** (`#3b82f6`, `#3B82F6`, Tailwind `blue-*` utilities, `text-blue-500`, `bg-blue-500`, chart `stroke`/`stopColor`) and replace with the gold equivalents — **except** keep blue where it means the "cold" lead temperature (semantic). See "Find & replace".
> 3. **Polish the `Button` component** (`src/components/ui/button.tsx`) — see "Buttons".
> 4. **Polish the sidebar nav** (`src/components/app-sidebar.tsx`) — see "Navigation".
> 5. Keep all status colors (green/amber/red/orange/purple/slate) unchanged — they're semantic.
>
> Verify by checking Dashboard, Pipeline, Analytics, Contracting, and Book of Business render with gold accents, legible gold buttons, and a clear gold active state in the sidebar.

---

## ✦ Token changes — `src/styles.css`

Replace these variables. Values given as oklch (matching the file's existing format); tune lightness/chroma visually if needed.

### `:root` (light)
| Variable | Old (blue) | New (gold `#C9A227`) |
|---|---|---|
| `--primary` | `oklch(0.625 0.196 257)` | `oklch(0.73 0.14 92)` |
| `--primary-foreground` | `oklch(0.99 0.005 250)` | `oklch(0.24 0.03 90)` ← **dark text on gold** |
| `--ring` | `oklch(0.625 0.196 257)` | `oklch(0.73 0.14 92)` |
| `--chart-1` | `oklch(0.625 0.196 257)` | `oklch(0.73 0.14 92)` |
| `--sidebar-primary` | `oklch(0.625 0.196 257)` | `oklch(0.73 0.14 92)` |
| `--sidebar-primary-foreground` | `oklch(0.99 0.005 250)` | `oklch(0.24 0.03 90)` |
| `--sidebar-ring` | `oklch(0.625 0.196 257)` | `oklch(0.73 0.14 92)` |
| `--accent` | `oklch(0.95 0.025 257)` | `oklch(0.96 0.03 95)` (warm gold tint) |
| `--sidebar-accent` | `oklch(0.95 0.02 257)` | `oklch(0.96 0.03 95)` |

**Leave unchanged:** `--info` / `--temp-cold` (keep blue — they're semantic "info"/"cold"), and all of `--success`, `--warning`, `--destructive`, `--temp-hot`, `--temp-warm`, `--chart-2..5`.

> Optional warmth: shift neutral surfaces a touch warmer to complement gold —
> `--background: oklch(0.99 0.004 95)`, `--border: oklch(0.92 0.008 95)`. Skip if you want to stay minimal.

### `.dark`
| Variable | New (gold) |
|---|---|
| `--primary` | `oklch(0.82 0.13 92)` (lighter gold for dark bg) |
| `--primary-foreground` | `oklch(0.20 0.03 90)` (dark text on gold) |
| `--ring` / `--chart-1` / `--sidebar-primary` / `--sidebar-ring` | `oklch(0.82 0.13 92)` |
| `--sidebar-primary-foreground` | `oklch(0.16 0.03 90)` |

---

## ✦ Find & replace (hardcoded blues)

These bypass the token system and must be swapped manually. **Gold = `#C9A227`** (or `#AD8819` for a deeper line/hover).

| Where | Find | Replace |
|---|---|---|
| `src/routes/_authenticated/dashboard.tsx` | KPI tiles `color="text-blue-500"` | `color="text-[#C9A227]"` |
| dashboard.tsx — chart gradient | `stopColor="#3b82f6"` (both stops) | `stopColor="#C9A227"` |
| dashboard.tsx — area stroke | `stroke="#3b82f6"` | `stroke="#C9A227"` |
| dashboard.tsx — legend dot | `bg-blue-500` | `bg-[#C9A227]` |
| Anywhere | `#3b82f6` / `#3B82F6` | `#C9A227` |
| Any page | `text-blue-*`, `bg-blue-*`, `border-blue-*`, `ring-blue-*` (decorative) | gold equivalent or `primary` token |

**Do NOT replace** blue inside `pipeline.tsx` `tempPill.cold` or the `temp-cold` token — cold leads stay blue on purpose. Keep the purple donut slice (`#a855f7`) and green (`#10b981`) as-is.

---

## ✦ Buttons — `src/components/ui/button.tsx`

Gold needs dark text and a touch of depth so the primary button reads as premium, not flat. Update `buttonVariants`:

- **base:** add active feedback + a gold focus ring:
  `... transition-all focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-[0.5px]`
- **default (primary):** dark text on a subtle gold gradient with depth:
  ```
  default:
    "text-primary-foreground shadow-[0_1px_2px_rgba(143,111,18,.3),0_4px_12px_rgba(201,162,39,.22)] " +
    "bg-[linear-gradient(180deg,#d8b23a,#c9a227_48%,#ad8819)] " +
    "hover:brightness-[1.03] active:shadow-inner",
  ```
  (Or simplest: keep `bg-primary` but ensure `--primary-foreground` is dark per the token table — the gradient is optional polish.)
- **outline:** warm gold hover instead of gray:
  `"border border-input bg-background shadow-sm hover:bg-accent hover:text-primary hover:border-primary/40"`
- Leave `destructive`, `secondary`, `ghost`, `link`, and all `size` values unchanged.

**Why:** gold (`#C9A227`) fails contrast with white text — dark foreground is required for legibility/accessibility.

---

## ✦ Navigation — `src/components/app-sidebar.tsx`

Give the active item a clear gold identity. The component uses shadcn `SidebarMenuButton` with `isActive`; style the active state via the sidebar tokens (already gold above) plus a left accent bar.

In `renderItem`, on the active `SidebarMenuButton`, add a gold left-accent + tint. Example (Tailwind):

```tsx
<SidebarMenuButton
  asChild isActive={active} tooltip={it.title}
  className={cn(
    "data-[active=true]:bg-primary/12 data-[active=true]:text-foreground data-[active=true]:font-semibold",
    "data-[active=true]:relative data-[active=true]:before:absolute data-[active=true]:before:left-0",
    "data-[active=true]:before:top-1.5 data-[active=true]:before:bottom-1.5 data-[active=true]:before:w-[3px]",
    "data-[active=true]:before:rounded-r data-[active=true]:before:bg-primary",
    "[&[data-active=true]_svg]:text-primary transition-colors"
  )}
>
```

Also: the brand mark `<div className="...bg-primary...">` will pick up gold automatically — confirm the `Cloud` icon inside uses `text-primary-foreground` (now dark) so it stays visible.

**Top bar** (`src/components/top-bar.tsx`): the notification `Badge` and avatar `AvatarFallback` use `bg-primary` / `text-primary-foreground` — they'll turn gold + dark-text automatically once tokens change. No manual edit needed.

---

## ✦ QA checklist

- [ ] Primary buttons show **dark text on gold** (not white-on-gold, not blue).
- [ ] Sidebar active item: gold tint + gold left bar + gold icon; inactive items unchanged.
- [ ] Dashboard chart: individual-production line + gradient are **gold**; team line stays green.
- [ ] KPI icons gold/green; donut active=green, in-review=purple.
- [ ] Cold-lead temperature pill is still **blue** (intentional).
- [ ] Focus rings are gold; hover/active button states feel responsive.
- [ ] Dark mode: gold is the lighter `oklch(0.82 …)`, text on gold still dark.
- [ ] No stray `#3b82f6` or decorative `blue-*` classes remain (`grep -ri "3b82f6\|blue-" src`).

---

*Reference build:* a working gold version of the **Dashboard** and **Pipeline** screens (plain HTML/CSS/JS) accompanies this handoff — use it as the visual target for accent placement, button depth, and the active-nav treatment.
