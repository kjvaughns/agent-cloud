import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const display = { fontFamily: "var(--font-display)" } as const;

/**
 * Shared shell for the legal pages.
 *
 * These carry real, specific commitments — data ownership, export, and the
 * fact that Agent Cloud is not an IMO — because those are the same promises
 * the marketing page makes. They are a starting point drafted from how the
 * platform actually behaves, and should still be reviewed by counsel before
 * launch.
 */
export function LegalPage({
  title, updated, children,
}: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-background text-foreground antialiased">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandLogo size={32} />
            <span className="text-lg font-bold tracking-[0.14em]" style={display}>AGENT CLOUD</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 md:py-16">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={display}>{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-2 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
    </div>
  );
}
