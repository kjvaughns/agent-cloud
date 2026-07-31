import { useRouterState } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/hooks/use-favorites";
import { pageByPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Star the page you are on.
 *
 * One control in the top bar rather than a star on every page — it works
 * everywhere without forty pages having to opt in, and it is where people
 * already look for "bookmark this", because that is where their browser
 * puts it.
 *
 * Renders nothing on a page that is not in the navigation registry. A star
 * that silently fails to stick would be worse than no star.
 */
export function StarPage() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { isStarred, toggle } = useFavorites();

  const page = pageByPath(path);
  if (!page) return null;

  const starred = isStarred(page.id);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => toggle(page.id, !starred)}
      aria-pressed={starred}
      // Says what will happen, not what is true — the pressed state already
      // carries the latter, and a screen reader announces both.
      aria-label={starred ? `Unstar ${page.label}` : `Star ${page.label}`}
      title={starred ? "Remove from your starred pages" : "Star this page for the sidebar"}
    >
      <Star
        className={cn(
          "h-4 w-4 transition-colors",
          starred ? "fill-primary text-primary" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
