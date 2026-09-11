# Show and keep full card number and CVC in the pipeline

Today the client's Bank Info screen accepts a card number and CVC but throws both away —
only the brand and last four digits are kept, and the number is shown as dots while typing.
This change keeps the whole card number and the CVC with the client, visible whenever the
agent opens that client.

## What changes for the agent

- Card Number shows the full number in plain text and saves as it's typed.
- CVC saves the same way and stays filled in next time the client is opened.
- Name on card, expiration month/year keep working as they do now.
- The saved card no longer reads "•••• 4242" — it shows the real number.
- Bank account and routing number stay hidden behind the show/hide eye, unchanged.

## One thing to be aware of

Card network rules (PCI DSS) forbid keeping a CVC after a payment is authorized, and
holding full card numbers makes the business responsible for card-data security.
This is being done deliberately because agents need the client's payment details to submit
policies to carriers. Access stays limited to the people who can already see the client:
the writing agent and their agency's owners/staff.

## Technical notes

- Migration: add `card_number text` and `card_cvc text` to `public.client_banking`
  (both nullable, no backfill). Existing `card_last4` and its CHECK constraint stay so
  nothing that reads last four breaks; last four continues to be derived on save.
- `src/lib/pipeline.functions.ts`: add `card_number` (digits/spaces, max 25) and
  `card_cvc` (3–4 digits) to `bankingSchema`; update the comment that currently states
  neither may ever exist. `upsertClientBanking` needs no other change.
- `src/components/pipeline/client-detail-drawer.tsx` → `BankingFields`:
  - Card number and CVC move from transient local state to `bankingForm`, seeded from
    `detail.banking`, persisted on blur alongside `card_brand`/`card_last4`.
  - Drop the `showCard` password toggle and the per-client clearing effect; remove the
    "only the brand and last four are saved" helper text.
  - Keep the Luhn warning and brand detection.
- No change to Post a Deal, Book of Business, or the bank-account fields.
- No RLS change — `client_banking` policies already scope reads to the client's owner and
  their agency.
