import { Link } from "@tanstack/react-router";
import { ArrowRight, Lock } from "lucide-react";
import { useNavContext } from "@/hooks/use-my-access";

/**
 * Why half the app is missing.
 *
 * Somebody who has just accepted an invite opens a workspace with no Clients,
 * no Book, no Finances and no Reports. Without a word of explanation that
 * reads as a broken account or a product that does less than they were told.
 *
 * So it says the two things worth knowing: what ends this, and what they can
 * get on with meanwhile. Both routes out are real — the agency can activate
 * them at any moment, and posting a policy does it on its own.
 *
 * Renders nothing for everybody else, which is nearly everybody.
 */
export function PendingAgentNotice() {
  const { isPending } = useNavContext();
  if (!isPending) return null;

  return (
    <div className="rounded-[var(--radius)] border border-primary/40 bg-gold-glow p-4">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Your account is set up. Selling opens once you're active.
          </p>
          <p className="text-sm text-muted-foreground">
            Clients, your book, commissions and reports appear the moment your agency activates
            you — or as soon as you post your first policy, whichever happens first.
          </p>
          <p className="text-sm text-muted-foreground">
            Until then, everything you need to get there is open: finish your producer profile,
            get contracted with carriers, and work through the academy.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
            <Link
              to="/account/producer-profile"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Producer Profile <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/contracting"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Get contracted <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/resources/new-agent-guide"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              New agent guide <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
