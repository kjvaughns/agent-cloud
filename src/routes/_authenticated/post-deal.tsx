import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { money, phone as fmtPhone } from "@/lib/format";
import {
  searchClients, listCarriersForDeal, getMyActiveCarrierIds, postDeal,
} from "@/lib/post-deal.functions";

export const Route = createFileRoute("/_authenticated/post-deal")({
  head: () => ({ meta: [{ title: "Post a Deal — Agent Cloud" }] }),
  component: PostDealPage,
});

const PRODUCTS = ["Final Expense", "Mortgage Protection", "Term Life", "Whole Life", "IUL", "GTL", "Annuity"];
const RELATIONSHIPS = ["Spouse", "Child", "Parent", "Sibling", "Other"];

type FormData = {
  client_type: "new" | "existing";
  existing_id?: string;
  first_name: string;
  last_name: string;
  phone: string;
  date_of_birth: string;
  carrier_id: string;
  product: string;
  policy_number: string;
  effective_date: string;
  face_amount: string;
  monthly_premium: string;
  beneficiaries: { first_name: string; last_name: string; relationship: string; dob: string; percentage: string }[];
  notes: string;
};

function PostDealPage() {
  const nav = useNavigate();
  const listCarriers = useServerFn(listCarriersForDeal);
  const myCarriers = useServerFn(getMyActiveCarrierIds);
  const submit = useServerFn(postDeal);
  const searchFn = useServerFn(searchClients);

  const { data: carriers } = useQuery({ queryKey: ["deal-carriers"], queryFn: () => listCarriers() });
  const { data: activeCarrierIds } = useQuery({ queryKey: ["my-active-carriers"], queryFn: () => myCarriers() });

  const form = useForm<FormData>({
    defaultValues: {
      client_type: "new",
      first_name: "", last_name: "", phone: "", date_of_birth: "",
      carrier_id: "", product: "", policy_number: "", effective_date: "",
      face_amount: "", monthly_premium: "",
      beneficiaries: [],
      notes: "",
    },
  });

  const { register, handleSubmit, watch, setValue, formState: { errors } } = form;
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "beneficiaries" });

  const clientType = watch("client_type");
  const monthly = Number(watch("monthly_premium") || 0);
  const annual = monthly * 12;
  const selectedCarrierId = watch("carrier_id");
  const carrierMissing = selectedCarrierId && activeCarrierIds && !activeCarrierIds.includes(selectedCarrierId);
  const selectedCarrierName = carriers?.find((c) => c.id === selectedCarrierId)?.name;
  const notes = watch("notes") ?? "";
  const benPctSum = (watch("beneficiaries") ?? []).reduce((a, b) => a + Number(b.percentage || 0), 0);
  const benValid = fields.length === 0 || Math.abs(benPctSum - 100) < 0.01;

  // Existing client search
  const [searchQ, setSearchQ] = useState("");
  const { data: clientResults } = useQuery({
    queryKey: ["client-search", searchQ],
    queryFn: () => searchFn({ data: { q: searchQ } }),
    enabled: clientType === "existing" && searchQ.length >= 2,
  });

  const mutation = useMutation({
    mutationFn: (d: FormData) =>
      submit({
        data: {
          client: {
            existing_id: d.client_type === "existing" ? d.existing_id : undefined,
            first_name: d.first_name, last_name: d.last_name,
            phone: d.phone, date_of_birth: d.date_of_birth,
          },
          policy: {
            carrier_id: d.carrier_id, product: d.product,
            policy_number: d.policy_number,
            effective_date: d.effective_date,
            face_amount: Number(d.face_amount || 0),
            monthly_premium: Number(d.monthly_premium || 0),
          },
          beneficiaries: d.beneficiaries.map((b) => ({
            first_name: b.first_name, last_name: b.last_name,
            relationship: b.relationship, dob: b.dob,
            percentage: Number(b.percentage || 0),
          })),
          notes: d.notes,
        },
      }),
    onSuccess: () => {
      toast.success("✓ Deal posted successfully! Your commission schedule has been calculated.");
      nav({ to: "/book-of-business" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (d: FormData) => {
    if (!benValid) {
      toast.error("Beneficiary percentages must sum to 100%.");
      return;
    }
    mutation.mutate(d);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Post a Deal</h1>
        <p className="text-sm text-muted-foreground mt-1">Record a new policy for yourself or a downline agent</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Client type */}
        <Card>
          <CardContent className="pt-6">
            <RadioGroup value={clientType} onValueChange={(v) => setValue("client_type", v as any)} className="flex gap-6">
              <div className="flex items-center gap-2"><RadioGroupItem value="new" id="new" /><Label htmlFor="new">New Client</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="existing" id="existing" /><Label htmlFor="existing">Existing Client</Label></div>
            </RadioGroup>
            {clientType === "existing" && (
              <div className="mt-4">
                <Input placeholder="Search by client name or phone..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
                {clientResults && clientResults.length > 0 && (
                  <div className="border rounded-md mt-2 max-h-48 overflow-auto">
                    {clientResults.map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        className="block w-full text-left px-3 py-2 hover:bg-muted text-sm"
                        onClick={() => {
                          setValue("existing_id", c.id);
                          setValue("first_name", c.first_name);
                          setValue("last_name", c.last_name);
                          setValue("phone", c.phone ?? "");
                          setValue("date_of_birth", c.date_of_birth ?? "");
                          setSearchQ(`${c.first_name} ${c.last_name}`);
                        }}
                      >
                        <div className="font-medium">{c.first_name} {c.last_name}</div>
                        <div className="text-xs text-muted-foreground">{fmtPhone(c.phone)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Client Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div><Label>First Name *</Label><Input {...register("first_name", { required: true })} className={errors.first_name ? "border-destructive" : ""} /></div>
            <div><Label>Last Name *</Label><Input {...register("last_name", { required: true })} className={errors.last_name ? "border-destructive" : ""} /></div>
            <div><Label>Phone Number *</Label>
              <Input
                {...register("phone", { required: true, minLength: 10 })}
                onChange={(e) => setValue("phone", fmtPhone(e.target.value) || e.target.value)}
                placeholder="(XXX) XXX-XXXX"
                className={errors.phone ? "border-destructive" : ""}
              />
            </div>
            <div><Label>Date of Birth *</Label><Input type="date" {...register("date_of_birth", { required: true })} className={errors.date_of_birth ? "border-destructive" : ""} /></div>
          </CardContent>
        </Card>

        {/* Policy Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Policy Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Carrier *</Label>
              <Select value={selectedCarrierId} onValueChange={(v) => setValue("carrier_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select carrier..." /></SelectTrigger>
                <SelectContent>{carriers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {carrierMissing && (
                <div className="mt-2 flex items-start gap-2 text-amber-700 dark:text-amber-400 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>You don't have an active contract with {selectedCarrierName}. Submit business with caution.</span>
                </div>
              )}
            </div>
            <div>
              <Label>Product Sold *</Label>
              <Select value={watch("product")} onValueChange={(v) => setValue("product", v)}>
                <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                <SelectContent>{PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Policy Number *</Label><Input {...register("policy_number")} placeholder="e.g., POL-123456" /></div>
            <div><Label>Effective Date *</Label><Input type="date" {...register("effective_date", { required: true })} /></div>
            <div><Label>Face Amount *</Label><Input type="number" {...register("face_amount", { required: true })} placeholder="e.g., 50000" /></div>
            <div><Label>Monthly Premium *</Label><Input type="number" step="0.01" {...register("monthly_premium", { required: true })} placeholder="e.g., 99.99" /></div>
            <div className="col-span-2">
              <Label>Annual Premium</Label>
              <div className="px-3 py-2 bg-muted rounded-md text-emerald-700 dark:text-emerald-400 font-semibold">
                {money(annual)} / year
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Beneficiaries */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Beneficiaries <span className="text-muted-foreground font-normal">(Optional)</span></CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={() => append({ first_name: "", last_name: "", relationship: "", dob: "", percentage: "" })}>
                <Plus className="h-3 w-3 mr-1" /> Add Beneficiary
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((f, idx) => (
              <div key={f.id} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3"><Label className="text-xs">First</Label><Input {...register(`beneficiaries.${idx}.first_name`)} /></div>
                <div className="col-span-2"><Label className="text-xs">Last</Label><Input {...register(`beneficiaries.${idx}.last_name`)} /></div>
                <div className="col-span-2">
                  <Label className="text-xs">Relation</Label>
                  <Select value={watch(`beneficiaries.${idx}.relationship`)} onValueChange={(v) => setValue(`beneficiaries.${idx}.relationship`, v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label className="text-xs">DOB</Label><Input type="date" {...register(`beneficiaries.${idx}.dob`)} /></div>
                <div className="col-span-2"><Label className="text-xs">%</Label><Input type="number" {...register(`beneficiaries.${idx}.percentage`)} /></div>
                <Button type="button" size="icon" variant="ghost" className="col-span-1" onClick={() => remove(idx)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {fields.length > 0 && (
              <div className={`text-sm ${benValid ? "text-muted-foreground" : "text-destructive font-medium"}`}>
                Total: {benPctSum}% {!benValid && "— must equal 100%"}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle className="text-base">Notes <span className="text-muted-foreground font-normal">(Optional)</span></CardTitle></CardHeader>
          <CardContent>
            <Textarea
              {...register("notes")}
              maxLength={2000}
              placeholder="Any additional notes about this deal, client health, or application details..."
              rows={4}
            />
            <div className="text-xs text-muted-foreground text-right mt-1">{notes.length} / 2000</div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={mutation.isPending}>
            {mutation.isPending ? "Posting..." : "Post Deal"}
          </Button>
        </div>
      </form>
    </div>
  );
}
