# Simple, beautiful Agency Setup and Settings

Goal: an agency owner can set up and change everything about their agency in minutes, in the same cream, gold and ink style as the /start experience.

## 1. One setup path
- Retire the old /setup wizard (raw image-address and color-code fields). Anyone sent there goes to /start, or to the new Launchpad if their workspace already exists.
- Nothing chosen during /start is asked for again.

## 2. Agency Launchpad
Replace the current setup progress bar at the top of Agency Settings with a Launchpad card:
- A gold progress ring and 4–5 remaining steps: brand your agency, add carriers, invite agents, connect your sales feed, set up contracting.
- Each step opens a short side drawer that does just that one thing, then ticks itself off.
- The card hides itself once everything is done (it can be reopened).

## 3. Settings reorganized into 4 hubs
Today there are 7 tabs. They become 4:

```text
Identity              name, logo, brand color, portal link, visibility
Carriers & Comp       your carriers, comp levels, levels/positions
Contracting           invite links, packets, workflows, Agency Suite codes
Connections           Discord/Slack sales feed, integrations, API keys
```

- "Roles & Permissions" stops repeating the whole Team page; it links to /team instead.
- Tabs become a left rail on desktop and a simple list on phones, so nothing overflows.
- Clicking Settings in the sidebar opens Agency Settings for owners, and Profile/Billing for solo agents (not Notifications).

## 4. Identity hub redesign
- Drag-and-drop logo upload with a light/dark preview.
- The same color swatches as /start, plus a custom color picker styled in the brand (no plain browser color box).
- Live preview showing your logo and color in the sidebar, an agent invite and an email header, updating as you change it.
- Saves automatically, with a small "Saved" confirmation.

## 5. Carriers & Comp made simple
- Carriers show as cards with logo, on/off switch and comp level.
- "Use standard levels" fills in common comp tiers in one click. The full grid editor stays available behind an "Advanced" button for power users.
- Carriers picked in /start already show as turned on.

## 6. Connections made plug-and-play
- Sales feed setup becomes: paste a Discord/Slack link → press "Send test" → pick a ready-made win message style. Raw settings move under "Advanced".

## 7. Visual polish everywhere in settings
- Remove long explanatory paragraphs; use one-line helper text.
- Brand pill buttons, gold highlights, generous spacing, consistent cards.
- Check every hub at phone and laptop sizes.

## Order of work
1. Settings route fix + 4-hub layout (biggest ease-of-use win).
2. Identity hub with live preview.
3. Launchpad + retire /setup.
4. Carriers & Comp cards with standard levels.
5. Connections simplification.
6. Phone/laptop browser check of every hub as an agency owner.

## Technical notes
- Agency settings data, permissions and paywall (AccessGate, plan gates) stay unchanged; this is a layout and presentation rework. Existing tab contents are moved into hub components rather than rewritten, except Identity, carrier cards and the sales-feed card.
- Old tab URLs/search params redirect to the matching hub so existing links keep working.
- /setup redirect keeps SetupRedirect behavior for owners with onboarding not completed.
- Standard comp tiers are presets that write the same comp grid records the advanced editor uses; no new commission logic (commission calculator remains the single source).
