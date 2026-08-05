import { Badge } from "@/components/ui/badge";

/**
 * "This record is not real."
 *
 * Rendered beside anything carrying `is_sample`. Small and quiet, because it
 * has to survive on a row that is mostly other information — but never
 * optional and never behind a setting. A seeded client that looks identical to
 * a real one is a compliance problem in an insurance product, not a cosmetic
 * one: somebody will eventually call a phone number that belongs to nobody, or
 * report a policy count to a carrier that includes forty invented policies.
 *
 * Takes the raw row value rather than a boolean so call sites can pass
 * `row.is_sample` straight through, including the `undefined` they get back
 * before the migration lands.
 */
export function SampleChip({ when, className }: { when?: boolean | null; className?: string }) {
  if (!when) return null;
  return (
    <Badge variant="secondary" className={className} title="Sample data — not a real record">
      Sample
    </Badge>
  );
}
