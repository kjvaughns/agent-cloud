# Align the Carrier Directory with Carriers & Comp

Goal: both pages look and work like one product. Settings is where owners switch carriers on and set comp and details. The Directory is where everyone looks up carrier info. Both show the same cards and the same information.

## 1. Shared carrier card
- One carrier card used on both pages, with the carrier name, an Annuity tag, pay frequency, average contracting days, phone, hours, and Agent Portal / Training buttons.
- Missing details no longer leave a blank card. They show a muted "No details yet" line. Owners also get an "Add details" link.

## 2. Carrier Directory redesign (/contracting/carriers)
- Title and one-line description. Owners get one main button: "Manage carriers," which opens Settings, Carriers & Comp.
- Search plus pill filters with counts: All, Weekly pay, Monthly pay, Fast (under 5 days), Annuity.
- Hub layout with cards on the left and an "At a glance" column on the right: active carriers, fastest contracting, weekly-pay count, and for owners, how many carriers are missing details.
- Owners see "Edit details" on each card. It opens a small dialog for portal link, training link, phone, hours, pay frequency, speed and notes. Saving updates both pages.
- Tapping a card still opens the "About" side panel, restyled.
- Still shows only carriers your agency has switched on.
- Phone layout: cards are one per row and the summary sits below them.

## 3. Settings, Carriers & Comp
- On/off cards use the same shared card in a compact form, so names, tags and details match the Directory.
- Each card gets the same "Edit details" dialog, so details aren't only reachable through Advanced.
- A "View directory" link shows what agents will see.

## Not changing
- Which carriers count as active, comp levels, contracting logic, permissions.

## Technical
- New `src/components/carriers/carrier-card.tsx` (shared card + `CarrierDetailsDialog`) built on ui-kit primitives (HubLayout, SummaryCard, FilterChips, EmptyCard, CardSkeleton).
- The dialog reuses the existing org-carrier detail save used by the Advanced drawer's edit dialog, gated to owners (no new permissions logic). If agency-level overrides and the global carrier record differ, the dialog edits the same fields the Advanced editor edits today.
- Both pages invalidate the `["contracting","carriers"]` and org-carriers queries after saving.
- Verify as your account at 1280px and 390px: same 7 carriers in the Directory, an edit in one place shows up in the other.
