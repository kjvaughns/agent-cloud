# Carriers missing when posting a deal

## What I found

Your account belongs to two agencies: **Vantage Financial** (your home agency, where all 5 carriers and 216 grid rows live) and **APEX Financial Empire** (empty — no carriers at all).

Until the fix I made earlier today, the app picked whichever of the two came back first from the database, with no fixed order. When it picked APEX Financial Empire, every carrier-driven list came back empty — that is the same root cause as the missing Position column on the Team page.

That fix is already in the working version: I opened Post a Deal just now and the dropdown lists Combined, Ethos, Guarantee Trust Life and Newbridge. The live site at useagentcloud.com is still running the older build, which is why it still shows nothing.

## What to do

1. Publish, so the live site picks up the home-agency fix. This alone restores your carriers.
2. Replace the silent empty dropdown with an honest message: when no carriers come back, say which agency the app is reading from and link to Agency settings, so an empty list can never again look like a broken screen.
3. Apply the same "no carriers" message in the pipeline card's Policy Information block (the screen in your screenshot), which uses a second carrier list and today just shows an empty picker.
4. Optional cleanup: if APEX Financial Empire is a leftover shell you don't use, I can remove your membership in it so nothing else can ever resolve to it.

## Technical notes

- `getMyOrgIds` in `src/lib/org-guard.ts` now orders `profiles.organization_id` first; `getMyPrimaryOrgId` takes `ids[0]`.
- Carrier lists: `listCarriersForDeal` (`src/lib/post-deal.functions.ts`) and `listCarriers` (`src/lib/pipeline.functions.ts`), both filtering `org_carriers` on the resolved org. Verified locally: 4 options.
- Empty-state copy goes in `src/routes/_authenticated/post-deal.tsx` and `src/components/pipeline/client-detail-drawer.tsx`; no server or data changes needed.
