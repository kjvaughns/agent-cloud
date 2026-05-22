import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FilePlus, Sparkles, CheckCircle2 } from "lucide-react";
import { fmtCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/post-deal")({
  component: PostDealPage,
});

function PostDealPage() {
  const [premium, setPremium] = useState(2400);
  const [product, setProduct] = useState("iul");
  const commission = Math.round(premium * (product === "iul" ? 1.05 : product === "term" ? 0.85 : 0.06));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><FilePlus className="h-7 w-7" /> Post a Deal</h1>
        <p className="text-muted-foreground mt-1">Submit a placed policy. Sophai will route to the right carrier and start the underwriting clock.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Deal Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Client First Name</Label><Input placeholder="John" /></div>
              <div className="space-y-2"><Label>Client Last Name</Label><Input placeholder="Smith" /></div>
              <div className="space-y-2"><Label>DOB</Label><Input type="date" /></div>
              <div className="space-y-2"><Label>State</Label>
                <Select defaultValue="TX">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["TX","CA","FL","NY","GA","NC","AZ"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Carrier</Label>
                <Select defaultValue="americo">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="americo">Americo</SelectItem>
                    <SelectItem value="mutual-of-omaha">Mutual of Omaha</SelectItem>
                    <SelectItem value="prudential">Prudential</SelectItem>
                    <SelectItem value="nationwide">Nationwide</SelectItem>
                    <SelectItem value="aegis">Aegis Life</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Product Type</Label>
                <Select value={product} onValueChange={setProduct}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iul">IUL</SelectItem>
                    <SelectItem value="term">Term Life</SelectItem>
                    <SelectItem value="annuity">Annuity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Annual Premium</Label>
                <Input type="number" value={premium} onChange={(e) => setPremium(Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-2"><Label>Face Amount</Label><Input type="number" placeholder="500000" /></div>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea placeholder="Med exam scheduled for Friday..." /></div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1">Submit Deal</Button>
              <Button variant="outline">Save Draft</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> Estimated Commission</CardTitle>
              <CardDescription>Live calc based on your contract level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{fmtCurrency(commission)}</div>
              <div className="text-xs text-muted-foreground mt-1">{product.toUpperCase()} @ {product === "iul" ? "105%" : product === "term" ? "85%" : "6%"} target</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Checklist</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {["Carrier appointment active","E&O on file","Replacement form (if applicable)","Illustration signed","HIPAA authorization"].map((it, i) => (
                <div key={it} className="flex items-center gap-2">
                  <CheckCircle2 className={`h-4 w-4 ${i < 2 ? "text-emerald-500" : "text-muted-foreground"}`} />
                  <span className={i < 2 ? "" : "text-muted-foreground"}>{it}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Recent Submissions</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { client: "R. Davis", premium: 3200, status: "Issued" },
                { client: "M. Patel", premium: 1850, status: "Pending" },
                { client: "K. Nguyen", premium: 4500, status: "UW Review" },
              ].map((d) => (
                <div key={d.client} className="flex items-center justify-between">
                  <div><div className="font-medium">{d.client}</div><div className="text-xs text-muted-foreground">{fmtCurrency(d.premium)} AP</div></div>
                  <Badge variant="secondary">{d.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
