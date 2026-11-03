import logoUrl from "@/assets/agent-cloud-logo.jpg";
import { cn } from "@/lib/utils";

/**
 * Agent Cloud brand mark. Use everywhere the primary product logo is meant
 * to appear (sidebar fallback, landing nav/footer, auth pages, emails).
 * Agencies with a custom `logo_url` should render that image instead — this
 * is only the Agent Cloud house mark.
 */
export function BrandLogo({
  className,
  size = 32,
  rounded = "rounded-lg",
  alt = "Agent Cloud",
}: {
  className?: string;
  size?: number;
  rounded?: string;
  alt?: string;
}) {
  return (
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 object-cover border border-border/60 shadow-sm", rounded, className)}
      style={{ width: size, height: size }}
    />
  );
}

export { logoUrl as brandLogoUrl };

/** "Agent Cloud" + optional grey product label — same wordmark as the sister sites. */
export function BrandWordmark({ product, size = 32, className }: { product?: string; size?: number; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandLogo size={size} className="border-0 shadow-none" />
      <span className="truncate whitespace-nowrap font-display text-lg font-semibold tracking-tight text-foreground">
        Agent Cloud{product ? <> <span className="font-normal text-muted-foreground">{product}</span></> : null}
      </span>
    </span>
  );
}
