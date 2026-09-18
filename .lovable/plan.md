# Carrier setup drives the carrier directory

## What's true today (checked in the code)

- The Carriers tab in Agency Settings edits contracting email, support email/phone, turnaround days, products, advance, contracting method and notes — but **not** phone, business hours, contracting speed, pay frequency, agent portal link or carrier training link.
- The Carriers directory page (Contracts hub) reads exactly those missing fields off the shared carrier library record, so an agency can never set or correct them. Custom carriers show almost nothing.
- The directory lists any carrier that isn't archived or terminated, so paused and not-contracted carriers still appear as if the agency uses them.

## What changes

### 1. Carrier setup gains the directory fields

The Basic settings step of the Add/Edit Carrier flow (and the edit dialog) gains, per agency:

- Phone number
- Business hours
- Contracting speed (typical days)
- Pay frequency (weekly / monthly)
- Product types (already there — kept in the same group)
- Website, Agent portal link, Carrier training link

These save as the agency's own values, so a shared library carrier is never overwritten for other agencies, and a custom carrier gets a full profile.

### 2. AI link lookup

A "Find links with AI" button on that step. It takes the carrier name (and website if entered) and suggests website, agent portal, carrier training page, contracting email, phone and business hours. Every suggestion lands in the fields as a draft the owner can accept, edit or clear — nothing saves on its own, and a field it can't find is left blank rather than guessed.

### 3. The directory only shows live carriers

The Carriers directory lists only carriers that are switched on and active for the agency. Paused, not-contracted, archived and terminated carriers disappear from it (they stay visible in Agency Settings, where they're managed). Each card shows the agency's own phone, hours, speed, pay frequency, products, agent portal and training links.

## Technical notes

- Additive migration on `org_carriers`: `phone`, `business_hours`, `contracting_speed_days`, `pay_frequency`, `agent_portal_url`, `training_url`, `website`. Types regenerated after.
- `saveOrgCarrier` input schema and the wizard's details step extended with those fields; `carriers` library rows stay read-only for agencies.
- New server function for the AI lookup, calling Lovable AI server-side with a strict schema (nullable fields, no invention), returning suggestions only — the client decides what to keep.
- `listCarriers` narrowed to `org_carriers.status = 'active' AND enabled`, and each row merged with the agency override falling back to the library value.
- Extend `carrier-wizard-check` / `carrier-products-check` to assert the new fields round-trip and that the directory excludes non-live carriers.
