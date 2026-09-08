# Pipeline search returns everything

## What's wrong

Both search boxes on Pipeline (the board search and the Sold tab search) match every
client no matter what you type, so the list never narrows and search looks broken.

Confirmed cause: each filter has a phone-number fallback that strips non-digits from
the typed text. When you type letters, the digits are an empty string, and "does this
phone contain an empty string" is always true — so every client passes the filter.

- `src/routes/_authenticated/pipeline.tsx` line 145
- `src/components/pipeline/sold-tab.tsx` line 76

## Fix

Only run the phone comparison when the typed text actually contains digits, and only
compare against clients that have a phone number. Text searches then match on name
only, and typing digits still matches a phone in any format (with or without dashes,
parens, spaces).

Same one-line change in both files; also include email in the name match so typing an
email address finds the client.

## Technical notes

Replace the phone clause with a precomputed `digits = q.replace(/\D/g, "")` and guard
`digits.length >= 3 && phoneDigits.includes(digits)`. No data or server-function
changes; presentation-layer filtering only.
