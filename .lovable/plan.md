
# Full UI Audit & Fix Pass

## Goal
Walk every route in the app, catch UI/runtime/workflow errors, and fix them so each page renders and its primary action works.

## Approach

### 1. Inventory
Routes to audit (from `src/routes/`):
- Public: `/login`, `/signup`, `/forgot-password`, `/reset-password`
- Auth shell: `/_authenticated` (sidebar + topbar)
- Pages: `/dashboard`, `/pipeline`, `/post-deal`, `/contracting` (+ children: index, carriers, invite, transfers, commission-grids, annuity-training), `/back-office` (+ compliance, licensing, recruiting-tracker, support), `/book-of-business`, `/calendar`, `/phone`, `/notifications`, `/analytics`, `/finances`, `/news-feed`, `/announcements`, `/team`, `/ai-assistant`, `/resources` (+ scripts, forms, training, marketing)

### 2. Audit each route for
- **Build/runtime errors**: bad imports (e.g. earlier `formatCurrency` vs `fmtCurrency`), missing exports, undefined components, type errors
- **Blank screens / SSR crashes**: top-level `localStorage`/`window` access, unguarded `process.env`, throws in render
- **Routing**: `<Link to="...">` targets that don't exist, missing `params`, hash-anchor abuse, missing `<Outlet />` in layouts
- **Workflow gaps**: buttons with no handler, forms that don't submit, dropdowns with no items, tabs that 404
- **Auth flow**: login → redirect, signup, forgot/reset password, sign-out, protected redirects preserve `redirect` param
- **Design tokens**: hardcoded colors instead of semantic tokens; light/dark contrast
- **A11y**: icon-only buttons missing `aria-label`, image `alt`, single `<main>`, heading order

### 3. Method
For each route file: read it, trace its imports, click through it in the browser preview, capture console + network errors, then fix in place. Group fixes by file to minimize churn.

### 4. Fixes will be surgical
- Repair broken imports / missing exports in `src/lib/*` and shared components
- Wire up dead buttons to their intended action or a `toast` placeholder
- Replace hardcoded colors with tokens from `src/styles.css`
- Add missing `aria-label`s and `<Outlet />`s
- Keep all business logic and data shapes unchanged — UI/presentation only

### 5. Verification per page
- Page renders without console errors
- Primary CTA works (or shows a clear toast if backend not wired)
- Nav links resolve, tabs switch, drawers/dialogs open & close
- Light + dark themes both readable

## Out of scope
- New features, schema changes, new backend logic
- Visual redesign — only fixing what's broken or inconsistent

## Deliverable
A single summary listing every page audited, issues found, and fixes applied.
