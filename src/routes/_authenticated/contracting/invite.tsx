import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  listOnboardingInvites,
  createOnboardingInvite,
  getMyContractedCarriers,
} from "@/lib/onboarding.functions";
import { deleteInvitationLink } from "@/lib/contracting.functions";
import { listScopeAgents } from "@/lib/scope.functions";
import { listCarrierGridLevels } from "@/lib/admin.functions";

/** Radix Select cannot hold "", so "me" stands in for the link's creator. */
const SELF = "__self__";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Copy, Check, Trash2, Lock, Link2, User, Users, Building2, ClipboardList, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRole } from "@/hooks/use-role";
import { listAgencyLevels } from "@/lib/contracting-records.functions";

export const Route = createFileRoute("/_authenticated/contracting/invite")({
  component: InviteRoute,
  head: () => ({ meta: [{ title: "Invite Links | Agent Cloud" }] }),
});

type Assignment = {
  carrier_id: string;
  carrier_name: string;
  level_name?: string | null;
  level_pct: number;
  release_needed?: boolean;
};

/**
 * The builder itself, once we know they may use it.
 *
 * `isManager` is `manager || isAdmin`, which mirrors the role list
 * `createOnboardingInvite` now enforces server-side — so the page refuses on
 * the same rule the server does, rather than offering a form whose submit
 * would throw.
 */
function InviteRoute() {
  const { isManager, loading } = useRole();

  if (loading) {
    return (
      <PageShell>
        <Skeleton className="h-64 rounded-xl" />
      </PageShell>
    );
  }

  if (!isManager) {
    return (
      <PageShell>
        <div className="mx-auto max-w-xl">
          <Panel title="Invite links are created by owners and managers">
            <p className="text-sm text-muted-foreground">
              An invite link places a new agent in a downline with carriers and commission levels
              already assigned, so creating one is limited to the people who own that structure.
              Ask your agency owner or your manager to send the link.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/contracting">Back to contracting</Link>
            </Button>
          </Panel>
        </div>
      </PageShell>
    );
  }

  return <InvitePage />;
}

function InvitePage() {
  const qc = useQueryClient();
  const [success, setSuccess] = useState<{ token: string; linkName: string } | null>(null);
  const [linkName, setLinkName] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [carriersOpen, setCarriersOpen] = useState(false);
  const [invitedRole, setInvitedRole] = useState<"agent" | "manager" | "agency_owner" | "staff">("agent");
  const [agencyLevelId, setAgencyLevelId] = useState("");
  // "" means the link creator, which is what upline_id being null means on the
  // row. A sentinel is needed because Radix Select cannot hold an empty value.
  const [uplineId, setUplineId] = useState("");
  // An agency-branded link: the joining agent picks their own upline.
  const [isAgencyLink, setIsAgencyLink] = useState(false);
  const { canInviteAgencyOwner, canInviteManager } = useRole();

  const { data: myCarriers } = useQuery({
    queryKey: ["onb", "myCarriers"],
    queryFn: () => getMyContractedCarriers(),
  });
  const { data: invites, isLoading } = useQuery({
    queryKey: ["onb", "invites", "mine"],
    queryFn: () => listOnboardingInvites({ data: { scope: "mine" } }),
  });
  const levelsFn = useServerFn(listAgencyLevels);
  const { data: agencyLevels } = useQuery({ queryKey: ["agency-levels"], queryFn: () => levelsFn() });

  // The people this person may place agents under. `get_scope_agents`
  // authorizes inside SQL, so an owner sees the agency and a manager sees only
  // their own downline — the same narrowing the server enforces on save.
  const scopeAgentsFn = useServerFn(listScopeAgents);
  const { data: uplineOptions } = useQuery({
    queryKey: ["scope-agents", "agency"],
    queryFn: () => scopeAgentsFn({ data: { scope: "agency" } }),
  });

  const createFn = useServerFn(createOnboardingInvite);
  const create = useMutation({
    mutationFn: () => createFn({ data: { link_name: linkName, invited_role: invitedRole, agency_level_id: agencyLevelId || null, upline_id: uplineId || null, is_agency_link: isAgencyLink, assignments: [] } }),
    onSuccess: (res: any) => {
      setSuccess({ token: res.token, linkName });
      qc.invalidateQueries({ queryKey: ["onb", "invites"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create link"),
  });

  const needsAgencyLevel = invitedRole === "agent" || invitedRole === "manager";
  const canCreate = linkName.trim().length > 0 && (!needsAgencyLevel || Boolean(agencyLevelId));

  function resetForm() {
    setSuccess(null);
    setLinkName("");
    setAssignments([]);
    setAgencyLevelId("");
    setUplineId("");
    setIsAgencyLink(false);
  }

  if (success) {
    const url = typeof window !== "undefined"
      ? `${window.location.origin}/invite/${success.token}`
      : `/invite/${success.token}`;
    return (
      <PageShell>
        <div className="max-w-3xl mx-auto">
          <Panel>
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-success/10 grid place-items-center">
                <Check className="h-8 w-8 text-success" />
              </div>
              <h2 className="text-2xl font-bold">Link Created!</h2>
              <p className="text-muted-foreground">Share this link with anyone you want to join your downline as <strong>{success.linkName}</strong>.</p>
              <div className="rounded-[var(--radius)] border border-border bg-surface-2 p-3 flex items-center gap-2">
                <code className="flex-1 text-xs text-left truncate">{url}</code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied!"); }}>
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">This link is reusable — anyone who clicks it can create their own account and join your team.</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={resetForm}>Create Another</Button>
              </div>
            </div>
          </Panel>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto space-y-[var(--gap)]">
      <HeroBand
        title="Invite Links"
        subtitle="Create a shareable link that places new agents directly in your downline. Carriers you pick become contracting requests for them to be worked — they are not active until submitted and approved."
      />

      <Panel><div className="space-y-5">
        <div>
          <Label>Link Name *</Label>
          <Input
            className="mt-1 max-w-sm"
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="e.g. New Agent, New Manager, Regional Lead"
            maxLength={80}
          />
          <p className="text-xs text-muted-foreground mt-1">This is just a label for you — it won't be shown to the person joining.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Invite As</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setInvitedRole("agent")}
              className={`rounded-lg border p-3 text-left transition-all space-y-0.5 ${invitedRole === "agent" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
            >
              <div className="font-medium text-sm flex items-center gap-1.5">
                <User className="h-4 w-4" /> Agent
                {invitedRole === "agent" && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
              </div>
              <div className="text-[11px] text-muted-foreground">Can work their own pipeline</div>
            </button>

            {canInviteManager && (
              <button
                type="button"
                onClick={() => setInvitedRole("manager")}
                className={`rounded-lg border p-3 text-left transition-all space-y-0.5 ${invitedRole === "manager" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              >
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <Users className="h-4 w-4" /> Manager
                  {invitedRole === "manager" && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
                </div>
                <div className="text-[11px] text-muted-foreground">Can manage a downline team</div>
              </button>
            )}

            {canInviteAgencyOwner && (
              <button
                type="button"
                onClick={() => setInvitedRole("agency_owner")}
                className={`rounded-lg border p-3 text-left transition-all space-y-0.5 col-span-2 ${invitedRole === "agency_owner" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              >
                <div className="font-medium text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span>Agency Owner</span>
                  <span className="inline-flex items-center rounded-full bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 text-[10px] font-semibold ml-1">
                    White Label
                  </span>
                  {invitedRole === "agency_owner" && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Gets their own branded sub-agency on Agent Cloud. They manage their own team independently.
                </div>
              </button>
            )}

            {/* Full width like Agency Owner above it — a half-width card alone
                at the end of the grid left dead space beside it. */}
            <button
              type="button"
              onClick={() => setInvitedRole("staff")}
              className={`rounded-lg border p-3 text-left transition-all space-y-0.5 col-span-2 ${invitedRole === "staff" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
            >
              <div className="font-medium text-sm flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4" /> Staff
                {invitedRole === "staff" && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
              </div>
              <div className="text-[11px] text-muted-foreground">Assistant — acts on your behalf</div>
            </button>
          </div>
        </div>

        {invitedRole !== "staff" && invitedRole !== "agency_owner" && (
          <div>
            <Label>Agency Level</Label>
            <Select value={agencyLevelId} onValueChange={setAgencyLevelId}>
              <SelectTrigger className="mt-1 max-w-sm"><SelectValue placeholder="Select their level" /></SelectTrigger>
              <SelectContent>{(agencyLevels?.rows ?? []).filter((l: any) => l.active).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name} ({Number(l.base_pct)}%)</SelectItem>)}</SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">This automatically applies the matching level across your agency carriers.</p>
          </div>
        )}

        {/* Who they report to. Left alone, the link places people under you —
            which is all it could ever do before. Choosing somebody else is how
            one owner builds a link for a manager's team without handing that
            manager the invite screen. */}
        {/* Two kinds of link. A personal one places everybody under one chosen
            person; an agency one is branded by the agency and lets the person
            joining say who they report to. */}
        {invitedRole !== "staff" && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Link Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsAgencyLink(false)}
                className={`rounded-lg border p-3 text-left transition-all space-y-0.5 ${!isAgencyLink ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              >
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <User className="h-4 w-4" /> Personal invite
                  {!isAgencyLink && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
                </div>
                <div className="text-[11px] text-muted-foreground">"[Your name] invited you" — you set the upline</div>
              </button>
              <button
                type="button"
                onClick={() => setIsAgencyLink(true)}
                className={`rounded-lg border p-3 text-left transition-all space-y-0.5 ${isAgencyLink ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              >
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" /> Agency signup link
                  {isAgencyLink && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
                </div>
                <div className="text-[11px] text-muted-foreground">"[Agency] invited you" — they pick their upline</div>
              </button>
            </div>
          </div>
        )}

        {invitedRole !== "staff" && !isAgencyLink && (
          <div>
            <Label>Their Upline</Label>
            <Select value={uplineId || SELF} onValueChange={(v) => setUplineId(v === SELF ? "" : v)}>
              <SelectTrigger className="mt-1 max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SELF}>Me (default)</SelectItem>
                {(uplineOptions ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    {[a.first_name, a.last_name].filter(Boolean).join(" ") || "Unnamed agent"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Anyone joining through this link is placed under whoever you pick here, and their
              carrier requests go to that person.
            </p>
          </div>
        )}

        {invitedRole !== "staff" && isAgencyLink && (
          <p className="text-xs text-muted-foreground">
            The signup page will show your agency's name and ask the new agent to choose their
            upline from the agents in your agency.
          </p>
        )}


        <div className="hidden rounded-[var(--radius)] border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setCarriersOpen((o) => !o)}
            aria-expanded={carriersOpen}
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">Carriers &amp; Commission Levels</span>
              <span className="block text-xs text-muted-foreground">
                Optional. Each one becomes a contracting request in your staff queue when
                the agent joins — the level you set here is what will be requested, not
                what they hold.
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {assignments.length > 0 && (
                <span className="rounded-full bg-gold-glow px-2 py-0.5 text-[11px] font-semibold text-gold-bright tnum">
                  {assignments.length} requested
                </span>
              )}
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", carriersOpen && "rotate-180")} />
            </span>
          </button>

          {carriersOpen && (
          <div className="border-t border-border p-3">
          {(myCarriers?.rows ?? []).length === 0 ? (
            <div className="p-6 text-center border border-border rounded-[var(--radius)] bg-surface-2">
              <p className="text-sm text-muted-foreground">You don't have any active carrier contracts to assign yet.</p>
            </div>
          ) : (
            <Accordion type="multiple" className="border border-border rounded-[var(--radius)] overflow-hidden divide-y">
              {(myCarriers?.rows ?? []).map((row: any) => {
                const carrier = row.carriers;
                if (!carrier) return null;
                const assignment = assignments.find((a) => a.carrier_id === carrier.id);
                const myPct = Number(row.assigned_pct);
                const isAssigned = !!assignment;
                return (
                  <AccordionItem key={carrier.id} value={carrier.id} className="border-0">
                    <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/30 [&>svg]:shrink-0">
                      <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <Checkbox
                          checked={isAssigned}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setAssignments((a) => [...a, { carrier_id: carrier.id, carrier_name: carrier.name, level_pct: myPct, level_name: null, release_needed: false }]);
                            } else {
                              setAssignments((a) => a.filter((x) => x.carrier_id !== carrier.id));
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="font-medium text-sm truncate">{carrier.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto mr-2 shrink-0 tnum">
                          {isAssigned
                            ? (assignment!.level_name || `${assignment!.level_pct}%`)
                            : "Not assigned"}
                        </span>
                      </div>
                    </AccordionTrigger>
                    {isAssigned && assignment && (
                      <AccordionContent className="px-3 pb-3 pt-0 border-t border-border bg-surface-2">
                        <div className="pt-3">
                          <Label className="text-xs">Commission Level</Label>
                          <CarrierLevelSelector
                            carrierId={carrier.id}
                            myPct={myPct}
                            value={assignment.level_name ?? ""}
                            onValueChange={(levelName, levelPct) =>
                              setAssignments((a) =>
                                a.map((x) =>
                                  x.carrier_id === carrier.id
                                    ? { ...x, level_name: levelName, level_pct: levelPct }
                                    : x
                                )
                              )
                            }
                          />
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Applies to all product groups for this carrier.
                          </p>
                        </div>
                      </AccordionContent>
                    )}
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}

          {assignments.length > 0 && (
            <p className="text-sm text-muted-foreground pt-2">{assignments.length} carrier{assignments.length === 1 ? "" : "s"} assigned</p>
          )}
          </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={() => create.mutate()} disabled={!canCreate || create.isPending}>
            <Link2 className="h-4 w-4 mr-1" /> {create.isPending ? "Creating..." : "Create Link"}
          </Button>
        </div>
      </div></Panel>

      {/* My Links */}
      <Panel title="My Invite Links">
        {isLoading ? <Skeleton className="h-24" /> : (invites?.rows.length ?? 0) === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No invite links created yet.</div>
        ) : (
          <LinksTable rows={invites?.rows ?? []} />
        )}
      </Panel>
      </div>
    </PageShell>
  );
}


function CarrierLevelSelector({
  carrierId,
  myPct,
  value,
  onValueChange,
}: {
  carrierId: string;
  myPct: number;
  value: string;
  onValueChange: (levelName: string, levelPct: number) => void;
}) {
  const gridLevelsFn = useServerFn(listCarrierGridLevels);
  const { data: carrierLevels = [] } = useQuery({
    queryKey: ["carrier-grid-levels", carrierId],
    queryFn: () => gridLevelsFn({ data: { carrier_id: carrierId } }),
  });
  const allowedLevels = (carrierLevels as any[]).filter((l: any) => l.max_pct <= myPct);

  if (allowedLevels.length === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-1">No commission levels configured for this carrier.</p>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const found = allowedLevels.find((l: any) => l.level_name === v);
        onValueChange(v, found?.max_pct ?? myPct);
      }}
    >
      <SelectTrigger className="mt-1"><SelectValue placeholder="Select level..." /></SelectTrigger>
      <SelectContent>
        {allowedLevels.map((l: any) => (
          <SelectItem key={l.level_name} value={l.level_name}>
            {l.level_name} ({l.max_pct}%)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LinksTable({ rows }: { rows: any[] }) {
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteInvitationLink);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Link deleted"); qc.invalidateQueries({ queryKey: ["onb", "invites"] }); },
  });

  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Link Name</TableHead>
        <TableHead>Upline</TableHead>
        <TableHead>Carriers</TableHead>
        <TableHead>Joined</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((r: any) => {
          const url = typeof window !== "undefined" ? `${window.location.origin}/invite/${r.token}` : "";
          const carriers = Array.isArray(r.carrier_assignments) ? r.carrier_assignments : [];
          const name = r.link_name || r.name || "Invite Link";
          const uplineName = r.upline
            ? [r.upline.first_name, r.upline.last_name].filter(Boolean).join(" ") || r.upline.email
            : null;
          return (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.is_agency_link ? "Chosen by agent" : uplineName ?? "You"}</TableCell>
              <TableCell>
                {carriers.length === 0 ? (
                  <span className="text-xs text-muted-foreground">None</span>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-left">
                        <Badge variant="outline" className="text-xs cursor-pointer">
                          {carriers.length} carrier{carriers.length === 1 ? "" : "s"} ▾
                        </Badge>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <ul className="space-y-2">
                        {carriers.map((c: any) => (
                          <li key={c.carrier_id} className="flex items-center justify-between text-xs gap-2">
                            <span className="font-medium truncate">{c.carrier_name}</span>
                            <span className="text-muted-foreground shrink-0 tnum">
                              {c.level_name ? `${c.level_name} (${c.level_pct}%)` : c.level_pct ? `${c.level_pct}%` : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                )}
              </TableCell>
              {/* How many people joined through this link, not whether one
                  person did. A shareable link has many acceptances. */}
              <TableCell className="tnum text-sm">
                {r.accepted_count > 0 ? (
                  <span className="font-semibold text-foreground">{r.accepted_count}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {r.expired ? (
                  <span className="rounded bg-destructive/15 px-2 py-0.5 text-xs text-destructive">Expired</span>
                ) : r.days_left != null && r.days_left <= 7 ? (
                  // Says it before it happens, rather than leaving the agent to
                  // discover it on a dead link.
                  <span className="rounded bg-warning/15 px-2 py-0.5 text-xs text-warning">
                    {r.days_left}d left
                  </span>
                ) : (
                  <span className="rounded bg-success/15 px-2 py-0.5 text-xs text-success">Active</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copied!"); }}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy Link
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{name}"?</AlertDialogTitle>
                        <AlertDialogDescription>The invite link will stop working immediately.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate(r.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function InviteStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: "bg-muted text-muted-foreground", label: "Active" },
    in_progress: { color: "bg-primary/15 text-primary", label: "In Progress" },
    completed: { color: "bg-success/15 text-success", label: "Completed" },
    expired: { color: "bg-destructive/15 text-destructive", label: "Expired" },
  };
  const cfg = map[status] ?? map.pending;
  return <span className={`px-2 py-0.5 rounded text-xs ${cfg.color}`}>{cfg.label}</span>;
}
