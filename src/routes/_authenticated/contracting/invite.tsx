import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARRIERS } from "@/lib/mock-data";
import { Copy, Check, Link as LinkIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contracting/invite")({
  component: InvitePage,
});

function InvitePage() {
  const [name, setName] = useState("Spring 2026 Recruits");
  const [assignments, setAssignments] = useState<Record<string, string>>(
    Object.fromEntries(CARRIERS.slice(0, 6).map((c) => [c, "105"]))
  );
  const [copied, setCopied] = useState(false);
  const url = `https://agent.cloud/invite/${name.toLowerCase().replace(/\s+/g, "-")}-x9k2`;

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <Card><CardContent className="p-6 space-y-4">
        <div>
          <Label>Invitation name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>
        <div className="space-y-2">
          <Label>Carrier commission assignments</Label>
          <div className="rounded-lg border divide-y">
            {CARRIERS.map((c) => (
              <div key={c} className="flex items-center gap-3 p-3">
                <div className="flex-1 font-medium text-sm">{c}</div>
                <Input
                  className="w-24 text-right"
                  value={assignments[c] ?? ""}
                  onChange={(e) => setAssignments((p) => ({ ...p, [c]: e.target.value }))}
                  placeholder="—"
                />
                <span className="text-sm text-muted-foreground w-6">%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-6 space-y-3">
        <Label>Shareable link</Label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm font-mono">
            <LinkIcon className="h-4 w-4 text-muted-foreground" />{url}
          </div>
          <Button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Anyone with this link can sign up under your downline with the commission levels above.</p>
      </CardContent></Card>
    </div>
  );
}
