/**
 * Which agents a licensing caller may see.
 *
 * This lived inline as a chained `.filter()` predicate and shipped as:
 *
 *   visible.size === 0 || visible.has(p.id) || true
 *
 * Two defects in one expression, and neither was reachable by a test because
 * the decision was buried inside a server function that opens four database
 * connections. That is the reason it is a module: the rule is small, it is the
 * whole security boundary for this page, and it should be possible to state it
 * and check it without a database.
 *
 * The rule: you see yourself, plus anybody row-level security actually returned
 * licence data for. Nothing else.
 */

/**
 * @param profiles  The org roster, read through the service-role client, so
 *                  row-level security has NOT filtered it.
 * @param visible   Agents whose licence, review or upload rows came back
 *                  through the RLS-bound client — i.e. the ones the caller is
 *                  genuinely entitled to.
 * @param callerId  Always included: an agent looking at their own record is the
 *                  normal case, and they may have nothing on file yet.
 */
export function visibleLicensingAgents<T extends { id: string }>(
  profiles: T[],
  visible: Set<string>,
  callerId: string,
): T[] {
  return profiles.filter((p) => p.id === callerId || visible.has(p.id));
}
