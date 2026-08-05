/**
 * What an agency writes, when nothing more specific is known.
 *
 * This list was copy-pasted into three files and one copy had drifted:
 * post-deal.tsx and client-detail-drawer.tsx agreed, while case-design.tsx had
 * gained "Universal Life" and "Other" and lost "Mortgage Protection" — so the
 * same policy could be classified differently depending on which screen the
 * person happened to be on, and neither list was wrong enough to notice.
 *
 * Reconciled here. "GTL" is gone: it is Guarantee Trust Life, a carrier, and it
 * had no business in a list of product types.
 *
 * This is the FALLBACK. The real answer is `org_carriers.product_types`, set
 * per carrier by the agency — see `listCarriersForDeal`. This is what a
 * dropdown shows when the selected carrier has nothing configured, because an
 * empty dropdown is worse than a general one.
 */
export const PRODUCT_TYPES = [
  "Final Expense",
  "Mortgage Protection",
  "Term Life",
  "Whole Life",
  "Universal Life",
  "IUL",
  "Annuity",
  "Other",
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

/** The list to show for a carrier, falling back when it has none configured. */
export function productsForCarrier(productTypes: string[] | null | undefined): readonly string[] {
  return productTypes && productTypes.length > 0 ? productTypes : PRODUCT_TYPES;
}
