#!/usr/bin/env bash
#
# Run every check in scripts/.
#
#   npm run check
#
# ── Why this exists ──
#
# Fourteen of the fifty check scripts had an entry in `package.json`. The other
# thirty-six did not, which meant nothing ever ran them — including every check
# written during the recovery work. A test nobody invokes is a file, not a test.
#
# This discovers them instead of listing them, so a check added tomorrow is run
# tomorrow rather than when somebody remembers to register it.
#
# Two checks are deliberately NOT run here, because each needs something
# running that a plain checkout does not have, and would fail for a reason
# that has nothing to do with the code:
#
#   npm run check:integration   # needs a local Postgres and root
#   npm run check:mobile        # needs the app served on localhost:3000
#
# Both are real and both should be run — just not as part of a check that is
# meant to pass on any machine with the repository checked out.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

pass=0
fail=0
failed=()

for f in scripts/*-check.ts; do
  name=$(basename "$f" .ts)
  if out=$(npx tsx "$f" 2>&1); then
    # The scripts report their own totals in varying wording; echo the last
    # line that carries one so a run is readable at a glance.
    summary=$(echo "$out" | grep -E "passed, [0-9]+ failed|All checks passed|accounted for" | tail -1)
    printf 'ok    %-34s %s\n' "$name" "${summary:-}"
    pass=$((pass + 1))
  else
    printf 'FAIL  %s\n' "$name"
    echo "$out" | tail -20 | sed 's/^/        /'
    failed+=("$name")
    fail=$((fail + 1))
  fi
done

echo ""
echo "$pass check scripts passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  printf '  %s\n' "${failed[@]}"
  exit 1
fi
