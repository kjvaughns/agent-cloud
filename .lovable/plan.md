# Fix "invalid input syntax for type date: 46295.7916"

## What's happening

`46295.7916` is how a spreadsheet stores a date with a time on it (day count since 1899, plus the fraction of the day). Import paths are handing that value straight to the database as if it were a date, so the whole import stops with this error instead of reading the date.

Two separate causes, both confirmed in the code:

1. Some import writers never convert dates at all — the value from the file or the outside system is written verbatim into date fields (client date of birth, policy effective date, posted date).
2. The converters that do exist only recognise a whole-number spreadsheet date (`46295`). A value with a decimal (`46295.7916`) falls through and is either rejected or passed along.

## The fix

Add one shared date reader and use it everywhere an import writes a date.

The reader accepts, and returns a plain `YYYY-MM-DD`:
- spreadsheet day counts, whole or with a time fraction, inside a sane 1990–2100 band
- real date values from spreadsheet parsers
- `YYYY-MM-DD`
- `M/D/YYYY` and `M/D/YY`
- `05-Jan-2026` style
- anything else the runtime can read confidently

Anything it cannot read confidently comes back empty, and the field is simply left blank rather than sent to the database. A blank date is recoverable; a failed import is not.

Then route every import date through it:
- book import (client date of birth, policy effective date, posted date, and the duplicate-merge and keep-both paths)
- the admin import workbook reader
- the carrier report reader
- the row extractor used by document/CSV reads

Where an import already logs skipped rows, unreadable dates get counted there too, so a file with bad date cells reports "imported, N dates unreadable" instead of failing silently or loudly.

## Technical notes

- New helper in `src/lib/import-normalize.ts` (or a small sibling module) exporting a single `toIsoDate(value: unknown): string | null`; existing `parseImportDate`, `reportDate` (`src/lib/import-carrier-reports.ts`), `parseDateMaybe` (`src/lib/admin-import.functions.ts`) and `isoDate` (`src/lib/import-extract-rows.ts`) delegate to it so the serial-with-fraction case is handled in one place and their current behaviour (ambiguity flag, the `1/1/1800` "never activated" sentinel) is preserved.
- `src/lib/book-import.functions.ts` is the likely source of this exact failure: `buildPolicy` writes `effective_date` raw and `posted_at` from `pol.created_at`, and the client inserts write `dob` raw at four call sites. All get wrapped.
- Serial conversion: `Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000`, so the time fraction is dropped rather than shifting the day across a timezone.
- No schema change and no migration; nothing already stored is modified.

## Verification

Unit-check the reader against `46295.7916`, `46295`, `2026-09-15`, `9/15/26`, `15-Sep-2026`, `1/1/1800`, blank, and junk, then re-run an import of the file that produced this error and confirm it completes with dates populated.
