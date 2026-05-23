import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  submitCaseDesign, listMyCaseDesigns, getCaseDesignDetail, searchClientsForCase,
} from "@/lib/back-office.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Clock, Lightbulb, CheckCircle2, ChevronRight, FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/back-office/case-design")({
  head: () => ({ meta: [
    { title: "Case Design — Agent Cloud" },
    { name: "description", content: "Submit complex cases for expert underwriting review within 24 hours." },
  ]}),
  component: CaseDesignPage,
});

const PRODUCTS = ["Final Expense", "Term Life", "Whole Life", "Universal Life", "IUL", "Annuity", "Other"];
const TOBACCO = ["Never", "Quit < 1 year ago", "Quit 1-5 years ago", "Quit 5+ years ago", "Current user"];

function CaseDesignPage() {
  const qc = useQueryClient();
  const submit = useServerFn(submitCaseDesign);
  const listFn = useServerFn(listMyCaseDesigns);
  const detailFn = useServerFn(getCaseDesignDetail);
  const searchFn = useServerFn(searchClientsForCase);

  const cases = useQuery({ queryKey: ["case-designs"], queryFn: () => listFn() });

  const [submitted, setSubmitted] = useState(false);
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["case-design", openDetailId],
    queryFn: () => detailFn({ data: { id: openDetailId! } }),
    enabled: !!openDetailId,
  });

  // form state
  const [mode, setMode] = useState<"existing" | "manual">("existing");
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const clientResults = useQuery({
    queryKey: ["case-client-search", clientQuery],
    queryFn: () => searchFn({ data: { q: clientQuery } }),
    enabled: mode === "existing",
  });
  const [coverage, setCoverage] = useState("");
  const [product, setProduct] = useState("");
  const [primary, setPrimary] = useState("");
  const [additional, setAdditional] = useState("");
  const [meds, setMeds] = useState("");
  const [ft, setFt] = useState("");
  const [inches, setInches] = useState("");
  const [weight, setWeight] = useState("");
  const [tobacco, setTobacco] = useState("Never");
  const [priorDecline, setPriorDecline] = useState(false);
  const [priorDetails, setPriorDetails] = useState("");
  const [occupation, setOccupation] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () => submit({ data: {
      client_id: mode === "existing" ? clientId : null,
      client_name_manual: mode === "manual" ? manualName : null,
      coverage_amount: Number(coverage),
      product_type: product,
      primary_condition: primary,
      additional_conditions: additional || null,
      medications: meds || null,
      height_in: ft && inches ? Number(ft) * 12 + Number(inches) : null,
      weight_lbs: weight ? Number(weight) : null,
      tobacco_use: tobacco,
      prior_decline: priorDecline,
      prior_decline_details: priorDecline ? priorDetails : null,
      occupation: occupation || null,
      hobbies: hobbies || null,
      additional_notes: notes || null,
    }}),
    onSuccess: () => {
      toast.success("Case submitted for review");
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ["case-designs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = useMemo(() => {
    if (!coverage || Number(coverage) <= 0) return false;
    if (!product) return false;
    if (!primary.trim()) return false;
    if (mode === "existing" && !clientId) return false;
    if (mode === "manual" && !manualName.trim()) return false;
    return true;
  }, [coverage, product, primary, mode, clientId, manualName]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Case Design</h2>
        <p className="text-muted-foreground">Get expert underwriting guidance for complex cases within 24 hours.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">What We Provide</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              "Carrier recommendations based on client's specific health situation",
              "Underwriting strategy to maximize approval chances",
              "Application approach and required documentation",
              "Alternative solutions if standard coverage isn't available",
              "Face amount optimization for best approval odds",
              "Multiple carrier options ranked by likelihood of approval",
            ].map((t) => (
              <div key={t} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" /><span>{t}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Perfect For</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              "Clients with medical conditions or health concerns",
              "High face amount cases ($500,000+)",
              "Business and estate planning cases",
              "Previously declined applications",
              "Clients with multiple health impairments",
              "Any case you're unsure which carrier to use",
            ].map((t) => (
              <div key={t} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" /><span>{t}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <HighlightCard icon={<Clock className="h-5 w-5" />} title="24-Hour Turnaround" body="Get carrier recommendations within one business day." />
        <HighlightCard icon={<Lightbulb className="h-5 w-5" />} title="Expert Underwriters" body="Cases reviewed by experienced life insurance underwriters." />
        <HighlightCard icon={<FileCheck2 className="h-5 w-5" />} title="Included in Partnership" body="No additional cost, included with your Agent Cloud access." />
      </div>

      <Card>
        <CardHeader><CardTitle>How Our Service Works</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 items-stretch">
            <StepCard n={1} title="Submit Your Case" body="Complete our form with client details, medical history, and coverage needs." />
            <StepCard n={2} title="Expert Review" body="Our underwriting team analyzes the case within 24 hours on business days." />
            <StepCard n={3} title="Get Recommendations" body="Receive specific carrier suggestions and application strategy via notification + email." />
          </div>
        </CardContent>
      </Card>

      {submitted ? (
        <Card className="border-success">
          <CardContent className="p-6 flex items-center gap-4">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <div className="flex-1">
              <div className="font-semibold text-lg">Case Submitted!</div>
              <div className="text-sm text-muted-foreground">Our team will review and respond within 24 hours.</div>
            </div>
            <Button variant="outline" onClick={() => { setSubmitted(false); resetForm(); }}>Submit another</Button>
          </CardContent>
        </Card>
      ) : (
        <Card id="submit-form">
          <CardHeader><CardTitle>Submit a Case for Review</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <Label>Client</Label>
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> Search existing</label>
                <label className="flex items-center gap-2"><input type="radio" checked={mode === "manual"} onChange={() => setMode("manual")} /> Enter manually</label>
              </div>
              {mode === "existing" ? (
                <div className="space-y-2">
                  <Input placeholder="Type to search clients..." value={clientQuery} onChange={(e) => { setClientQuery(e.target.value); setClientId(null); }} />
                  {clientResults.data && clientResults.data.length > 0 && (
                    <div className="border rounded-md max-h-40 overflow-y-auto">
                      {clientResults.data.map((c) => (
                        <button key={c.id} onClick={() => { setClientId(c.id); setClientQuery(`${c.first_name} ${c.last_name}`); }}
                          className={`w-full text-left px-3 py-2 hover:bg-muted text-sm ${clientId === c.id ? "bg-muted" : ""}`}>
                          {c.first_name} {c.last_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Input placeholder="Client name" value={manualName} onChange={(e) => setManualName(e.target.value)} />
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div><Label>Coverage Amount Needed *</Label><Input type="number" placeholder="250000" value={coverage} onChange={(e) => setCoverage(e.target.value)} /></div>
              <div><Label>Product Type *</Label>
                <Select value={product} onValueChange={setProduct}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Primary Health Condition *</Label>
              <Textarea rows={3} placeholder="e.g., Type 2 diabetes, diagnosed 2018, managed with Metformin, A1C 7.2" value={primary} onChange={(e) => setPrimary(e.target.value)} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div><Label>Additional Conditions</Label><Textarea rows={2} value={additional} onChange={(e) => setAdditional(e.target.value)} /></div>
              <div><Label>Medications</Label><Textarea rows={2} placeholder="List current medications" value={meds} onChange={(e) => setMeds(e.target.value)} /></div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div><Label>Height</Label>
                <div className="flex gap-2"><Input type="number" placeholder="ft" value={ft} onChange={(e) => setFt(e.target.value)} /><Input type="number" placeholder="in" value={inches} onChange={(e) => setInches(e.target.value)} /></div>
              </div>
              <div><Label>Weight (lbs)</Label><Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
              <div><Label>Tobacco Use</Label>
                <Select value={tobacco} onValueChange={setTobacco}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TOBACCO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Any prior declines?</Label>
                <div className="text-xs text-muted-foreground">Has this client ever been declined for life insurance?</div>
              </div>
              <Switch checked={priorDecline} onCheckedChange={setPriorDecline} />
            </div>
            {priorDecline && (
              <Textarea rows={2} placeholder="Which carrier? When? Reason if known" value={priorDetails} onChange={(e) => setPriorDetails(e.target.value)} />
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div><Label>Occupation</Label><Input value={occupation} onChange={(e) => setOccupation(e.target.value)} /></div>
              <div><Label>Hobbies / Activities</Label><Input placeholder="High-risk activities, e.g. scuba, aviation" value={hobbies} onChange={(e) => setHobbies(e.target.value)} /></div>
            </div>
            <div>
              <Label>Additional Notes</Label>
              <Textarea rows={3} placeholder="Any other details that might help our underwriters..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit for Design Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(cases.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle>My Case Submissions</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border divide-y">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
                <div className="col-span-2">Date</div>
                <div className="col-span-3">Client</div>
                <div className="col-span-2">Coverage</div>
                <div className="col-span-2">Product</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1"></div>
              </div>
              {cases.data?.map((c) => (
                <button key={c.id} onClick={() => c.status === "complete" && setOpenDetailId(c.id)}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm w-full text-left hover:bg-muted/30 disabled:cursor-default" disabled={c.status !== "complete"}>
                  <div className="col-span-2">{format(new Date(c.created_at), "MMM d, yyyy")}</div>
                  <div className="col-span-3 truncate">{c.client_name || "—"}</div>
                  <div className="col-span-2">${Number(c.coverage_amount ?? 0).toLocaleString()}</div>
                  <div className="col-span-2">{c.product_type}</div>
                  <div className="col-span-2"><StatusBadge status={c.status} /></div>
                  <div className="col-span-1 flex justify-end">{c.status === "complete" && <ChevronRight className="h-4 w-4 text-muted-foreground" />}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Sheet open={!!openDetailId} onOpenChange={(o) => !o && setOpenDetailId(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Underwriter Recommendations</SheetTitle>
            <SheetDescription>
              Submitted {detail.data && format(new Date(detail.data.created_at), "MMM d, yyyy")}
            </SheetDescription>
          </SheetHeader>
          {detail.data?.response_html ? (
            <div className="prose prose-sm dark:prose-invert max-w-none mt-4"
              dangerouslySetInnerHTML={{ __html: sanitize(detail.data.response_html) }} />
          ) : (
            <p className="text-sm text-muted-foreground mt-4">No response yet.</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );

  function resetForm() {
    setClientId(null); setClientQuery(""); setManualName(""); setCoverage(""); setProduct("");
    setPrimary(""); setAdditional(""); setMeds(""); setFt(""); setInches(""); setWeight("");
    setTobacco("Never"); setPriorDecline(false); setPriorDetails(""); setOccupation(""); setHobbies(""); setNotes("");
  }
}

function HighlightCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card><CardContent className="p-4 flex gap-3">
      <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</div>
      <div><div className="font-medium">{title}</div><div className="text-sm text-muted-foreground">{body}</div></div>
    </CardContent></Card>
  );
}

function StepCard({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="rounded-lg border p-4 relative">
      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold mb-2">{n}</div>
      <div className="font-medium">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{body}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "complete") return <Badge className="bg-success/15 text-success border-success/30">Recommendations Ready</Badge>;
  if (status === "needs_info") return <Badge className="bg-warning/15 text-warning border-warning/30">Info Needed</Badge>;
  return <Badge className="bg-info/15 text-info border-info/30">Under Review</Badge>;
}

// Minimal HTML sanitizer — strips <script>, on* attrs, javascript: URIs
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}
