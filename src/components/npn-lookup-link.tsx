import { ExternalLink } from "lucide-react";

const NPN_LOOKUP_URL = "https://nipr.com/licensing-center/look-up-a-national-producer-number";

export function NpnLookupLink({ className }: { className?: string }) {
  return (
    <a
      href={NPN_LOOKUP_URL}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline ${className ?? ""}`}
    >
      <ExternalLink className="h-3 w-3" />
      Look up your NPN
    </a>
  );
}
