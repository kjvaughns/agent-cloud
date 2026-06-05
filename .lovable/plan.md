# Fix: Address autocomplete not auto-filling city/state/ZIP on pick

## Root cause
In `src/components/pipeline/client-detail-drawer.tsx`, the address `EditableField` runs `onBlur={save}` on the `<Input>`. When the user clicks a suggestion in the dropdown, the input loses focus first — `save()` fires, calls `setEditing(false)`, and unmounts `AddressAutocomplete` before the suggestion's `onClick` runs. Result: only the typed street text gets saved; `onSelect` (which patches `street_address` + `city` + `state` + `zip_code` together) never executes.

The same race affects any other call site that combines a blur-to-save pattern with the autocomplete dropdown (producer profile / invite form are less affected because they don't unmount on blur, but the underlying component should still be robust).

## Changes

### 1. `src/components/address-autocomplete.tsx`
- On each suggestion `<button>`, add `onMouseDown={(e) => e.preventDefault()}` so the host input never loses focus when the user clicks a suggestion. This guarantees the parent's `onBlur` (if any) doesn't fire before `handlePick` → `onSelect`.

### 2. `src/components/pipeline/client-detail-drawer.tsx` (address branch of `EditableField`)
- Remove `onBlur={save}` from the address-mode `AddressAutocomplete` (commit happens via `onSelect` or Enter). Keep an outside-click close path that does NOT save partial input — prevents the partial-save race entirely.
- Keep `onKeyDown` Enter → `save()` for users who type a freeform address and press Enter.
- After `onSelect`, also update local `val` so the displayed value reflects the picked street.

## Verification
- Open a client → edit Street Address → type "123 ", pick a suggestion → confirm street, city, state, and ZIP all update without manual entry.
- Producer Profile and Invite onboarding: pick a suggestion → confirm all four fields populate.
- Typing freeform text + Enter still saves just the street.

## Out of scope
- No schema, routing, or styling changes. No new fields added to the pipeline Add Client dialog (it intentionally only collects name + phone).
