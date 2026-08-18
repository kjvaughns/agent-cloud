import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  ordinalDay,
  ssPayWeekFromDob,
  ssWeekLabel,
  suggestedDraftDay,
} from "@/lib/deals/social-security";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { productsForCarrier } from "@/lib/products";
import { saleMonthLabel, todaySaleDate } from "@/lib/sale-date";
import { getCarrierDealOptions } from "@/lib/compensation/deal-pricing.server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { money, phone as fmtPhone } from "@/lib/format";
import {
  searchClients,
  listCarriersForDeal,
  getMyActiveCarrierIds,
  postDeal,
  getClientDealPrefill,
} from "@/lib/post-deal.functions";
import { PostDealQaButton } from "@/components/ai/post-deal-qa";
import { PageShell, HeroBand } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/post-deal")({
  validateSearch: (s: Record<string, unknown>): { client_id?: string } => ({
    client_id: typeof s.client_id === "string" ? s.client_id : undefined,
  }),
  head: () => ({ meta: [{ title: "Post a Deal — Agent Cloud" }] }),
  component: PostDealPage,
});

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
  sale_date: string;
  face_amount: string;
  monthly_premium: string;
  status: "issued_not_paid" | "in_review";
  beneficiaries: {
    first_name: string;
    last_name: string;
    relationship: string;
    dob: string;
    percentage: string;
  }[];
  notes: string;
  payment_method: string;
  draft_date: string;
};

function PostDealPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { client_id } = Route.useSearch();
  const listCarriers = useServerFn(listCarriersForDeal);
  const myCarriers = useServerFn(getMyActiveCarrierIds);
  const submit = useServerFn(postDeal);
  const searchFn = useServerFn(searchClients);

  const { data: carriers } = useQuery({
    queryKey: ["deal-carriers"],
    queryFn: () => listCarriers(),
  });
  const { data: activeCarrierIds } = useQuery({
    queryKey: ["my-active-carriers"],
    queryFn: () => myCarriers(),
  });

  const form = useForm<FormData>({
    defaultValues: {
      payment_method: "",
      draft_date: "",
      client_type: "new",
      first_name: "",
      last_name: "",
      phone: "",
      date_of_birth: "",
      carrier_id: "",
      product: "",
      policy_number: "",
      effective_date: "",
      // Defaults to today, so the common case — a deal written today — needs no
      // thought and behaves exactly as it always has.
      sale_date: todaySaleDate(),
      face_amount: "",
      monthly_premium: "",
      status: "issued_not_paid",
      beneficiaries: [],
      notes: "",
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "beneficiaries",
  });

  // Pull everything already on the client record so the agent is confirming a
  // filled-in form rather than retyping what they just entered in the pipeline.
  const prefillFn = useServerFn(getClientDealPrefill);
  const { data: prefill } = useQuery({
    queryKey: ["deal-prefill", client_id],
    queryFn: () => prefillFn({ data: { client_id: client_id! } }),
    enabled: Boolean(client_id),
    staleTime: 0,
  });

  useEffect(() => {
    if (client_id) {
      setValue("client_type", "existing");
      setValue("existing_id", client_id);
    }
  }, [client_id, setValue]);

  const prefilled = useRef(false);
  useEffect(() => {
    if (!prefill || prefilled.current) return;
    prefilled.current = true;

    setValue("first_name", prefill.client.first_name);
    setValue("last_name", prefill.client.last_name);
    setValue("phone", prefill.client.phone);
    setValue("date_of_birth", prefill.client.date_of_birth);

    if (prefill.policy) {
      setValue("carrier_id", prefill.policy.carrier_id);
      setValue("product", prefill.policy.product);
      setValue("policy_number", prefill.policy.policy_number);
      setValue("effective_date", prefill.policy.effective_date);
      setValue("face_amount", prefill.policy.face_amount);
      setValue("monthly_premium", prefill.policy.monthly_premium);
      setValue("status", prefill.policy.status);
    }

    if (prefill.billing) {
      setValue("payment_method", prefill.billing.payment_method);
      setValue("draft_date", prefill.billing.draft_date);
    }

    if (prefill.beneficiaries.length) {
      // replace() rather than append(), so a re-render cannot duplicate rows.
      replace(prefill.beneficiaries);
    }
  }, [prefill, setValue, replace]);

  const clientType = watch("client_type");
  const monthly = Number(watch("monthly_premium") || 0);
  const annual = monthly * 12;

  /**
   * When Social Security is the method, say when the deposit lands.
   *
   * A suggestion, not an assignment: anyone on benefits since before May 1997
   * is paid on the 3rd whatever their birthday says, and this product has no
   * way to know that. The agent stays in charge of the day.
   */
  const paymentMethod = watch("payment_method");
  const clientDob = watch("date_of_birth");
  const ssHint = useMemo(() => {
    if (paymentMethod !== "social_security") return null;
    const week = ssPayWeekFromDob(clientDob);
    const day = suggestedDraftDay(clientDob);
    if (!week || !day) return null;
    return {
      day,
      text: `Social Security pays this client on the ${ssWeekLabel(week)} — the ${ordinalDay(day)} this month.`,
    };
  }, [paymentMethod, clientDob]);
  const selectedCarrierId = watch("carrier_id");
  const carrierMissing =
    selectedCarrierId && activeCarrierIds && !activeCarrierIds.includes(selectedCarrierId);
  const selectedCarrier = carriers?.find((c) => c.id === selectedCarrierId);
  const selectedCarrierName = selectedCarrier?.name;

  // Two groups, not two lists: the ones this agent holds a contract with, then
  // the rest of the agency's carriers below a divider. The second group stays
  // visible because an agent may legitimately be writing under a just-in-time
  // appointment — it is marked, not hidden.
  const mine = (carriers ?? []).filter((c) => activeCarrierIds?.includes(c.id));
  const others = (carriers ?? []).filter((c) => !activeCarrierIds?.includes(c.id));

  // What this carrier actually pays on, taken from its comp grid.
  //
  // The grid is the only place that knows: `org_carriers.product_types` is a
  // free-text list an owner typed, and a product on it that the grid says
  // nothing about prices at the agent's flat level percentage while looking
  // like a configured choice. The grid's own product names are the ones the
  // rate rows are keyed on, so choosing from them is what makes the age bands
  // and state exceptions reachable at all.
  //
  // Order of preference, and the fallback matters: grid products, then the
  // owner's typed list, then the general catalogue. An empty dropdown is worse
  // than a broad one — most agencies have no grid yet, and they must still be
  // able to post a deal.
  const { data: dealOptions } = useQuery({
    // Keyed on "carrier" as well as the id: this call used to be handed the
    // same uuid under a different meaning, and a cache entry from the old
    // shape must not answer the new one.
    queryKey: ["carrier-deal-options", "carrier", selectedCarrier?.id],
    queryFn: () => getCarrierDealOptions({ data: { carrierId: selectedCarrier!.id } }),
    enabled: Boolean(selectedCarrier?.id),
  });
  const gridProducts = dealOptions?.products ?? [];
  const products = gridProducts.length > 0
    ? gridProducts
    : productsForCarrier(selectedCarrier?.product_types);
  const notes = watch("notes") ?? "";
  const benPctSum = (watch("beneficiaries") ?? []).reduce(
    (a, b) => a + Number(b.percentage || 0),
    0,
  );
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
            first_name: d.first_name,
            last_name: d.last_name,
            phone: d.phone,
            date_of_birth: d.date_of_birth,
          },
          policy: {
            carrier_id: d.carrier_id,
            product: d.product,
            policy_number: d.policy_number,
            effective_date: d.effective_date,
            sale_date: d.sale_date,
            face_amount: Number(d.face_amount || 0),
            monthly_premium: Number(d.monthly_premium || 0),
            status: d.status,
          },
          beneficiaries: d.beneficiaries.map((b) => ({
            first_name: b.first_name,
            last_name: b.last_name,
            relationship: b.relationship,
            dob: b.dob,
            percentage: Number(b.percentage || 0),
          })),
          notes: d.notes,
          // Omitted entirely when the agent left both blank, so posting a deal
          // before billing is arranged writes no client_banking row at all.
          billing: {
            payment_method: d.payment_method ? (d.payment_method as any) : undefined,
            draft_date: d.draft_date ? Number(d.draft_date) : undefined,
          },
        },
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["bob", "list"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });

      // The deal is written either way — but if nothing could work out what it
      // pays, saying only "Deal posted!" is how an agent finds out weeks later
      // that they earned nothing. The reasons come from the resolver and name
      // what an owner has to fix.
      if (res?.compensation && res.compensation.ok === false) {
        toast.warning("Deal posted — but the commission could not be worked out", {
          description: res.compensation.messages?.join(" ") ?? undefined,
          duration: 12000,
        });
      } else {
        toast.success("Deal posted! Client moved to Sold tab.");
      }
      nav({ to: "/pipeline", search: { tab: "sold" } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (d: FormData) => {
    // The server schema requires a carrier and product; without this guard an
    // empty select reaches it and surfaces as a raw ZodError / blank screen.
    if (!d.carrier_id) {
      toast.error("Select a carrier before posting the deal.");
      return;
    }
    if (!d.product) {
      toast.error("Select the product sold before posting the deal.");
      return;
    }
    if (!benValid) {
      toast.error("Beneficiary percentages must sum to 100%.");
      return;
    }
    mutation.mutate(d);
  };


  return (
    <PageShell>
      <div className="max-w-3xl mx-auto">
        <div className="mb-[var(--gap)]">
          <HeroBand
            title="Post a Deal"
            subtitle="Record a new policy for yourself or a downline agent"
          />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Client type */}
          <Card>
            <CardContent className="pt-6">
              <RadioGroup
                value={clientType}
                onValueChange={(v) => setValue("client_type", v as any)}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="new" id="new" />
                  <Label htmlFor="new">New Client</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="existing" id="existing" />
                  <Label htmlFor="existing">Existing Client</Label>
                </div>
              </RadioGroup>
              {clientType === "existing" && (
                <div className="mt-4">
                  <Input
                    placeholder="Search by client name or phone..."
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                  />
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
                          <div className="font-medium">
                            {c.first_name} {c.last_name}
                          </div>
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
            <CardHeader>
              <CardTitle className="text-base">Client Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name *</Label>
                <Input
                  {...register("first_name", { required: true })}
                  className={errors.first_name ? "border-destructive" : ""}
                />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input
                  {...register("last_name", { required: true })}
                  className={errors.last_name ? "border-destructive" : ""}
                />
              </div>
              <div>
                <Label>Phone Number *</Label>
                <Input
                  {...register("phone", { required: true, minLength: 10 })}
                  onChange={(e) => setValue("phone", fmtPhone(e.target.value) || e.target.value)}
                  placeholder="(XXX) XXX-XXXX"
                  className={errors.phone ? "border-destructive" : ""}
                />
              </div>
              <div>
                <Label>Date of Birth *</Label>
                <Input
                  type="date"
                  {...register("date_of_birth", { required: true })}
                  className={errors.date_of_birth ? "border-destructive" : ""}
                />
              </div>
            </CardContent>
          </Card>

          {/* Policy Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Policy Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Carrier *</Label>
                <Select value={selectedCarrierId} onValueChange={(v) => setValue("carrier_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select carrier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mine.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                    {others.length > 0 && (
                      <>
                        {mine.length > 0 && (
                          <div className="mt-1 border-t border-border px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            No contract on file
                          </div>
                        )}
                        {others.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {(carriers?.length ?? 0) === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground">
                        No carriers set up yet. An agency admin adds them in Contracting Ops →
                        Carriers.
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {carrierMissing && (
                  <div className="mt-2 flex items-start gap-2 text-warning text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      You don't have an active contract with {selectedCarrierName}. Submit business
                      with caution.
                    </span>
                  </div>
                )}
              </div>
              <div>
                <Label>Product Sold *</Label>
                <Select value={watch("product")} onValueChange={(v) => setValue("product", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p: string) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Which list this is. "Whole Life" appears in both the grid
                    and the general catalogue, so without saying so an agent
                    cannot tell whether the names in front of them are their
                    agency's configured products or a stock list. */}
                {gridProducts.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {selectedCarrierName}'s products, from the comp grid.
                  </p>
                )}
                {/* The grid names the products but prices them per contract
                    level. Without a level there is no column to read, so the
                    deal pays the flat position percentage — worth saying here,
                    where the agent is looking at grid product names and would
                    otherwise assume grid rates. */}
                {gridProducts.length > 0 && !dealOptions?.carrierLevelName && (
                  <p className="mt-1 text-xs text-warning">
                    You are not mapped to a contract level on {selectedCarrierName}, so this pays
                    your position percentage rather than the grid rate. An agency admin can set
                    the mapping under Agency settings ▸ Levels &amp; Positions.
                  </p>
                )}
              </div>
              <div>
                <Label>Policy Number *</Label>
                <Input {...register("policy_number")} placeholder="e.g., POL-123456" />
              </div>
              <div>
                <Label>Effective Date *</Label>
                <Input type="date" {...register("effective_date", { required: true })} />
              </div>
              <div>
                <Label>Sale Date *</Label>
                {/* Capped at today: production cannot be claimed forward, and
                    the database rejects it anyway. */}
                <Input
                  type="date"
                  max={todaySaleDate()}
                  {...register("sale_date", { required: true })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {watch("sale_date") === todaySaleDate()
                    ? "Counts toward this month. Change it to log an older sale."
                    : `Counts toward ${saleMonthLabel(watch("sale_date"))} on production and the leaderboard.`}
                </p>
              </div>
              <div>
                <Label>Face Amount *</Label>
                <Input
                  type="number"
                  {...register("face_amount", { required: true })}
                  placeholder="e.g., 50000"
                />
              </div>
              <div>
                <Label>Monthly Premium *</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register("monthly_premium", { required: true })}
                  placeholder="e.g., 99.99"
                />
              </div>

              {/* How the premium is paid. Both optional — a policy is often
                posted before billing is arranged. Method and day only; the
                platform has no reason to hold an account number. */}
              <div>
                <Label>Payment method</Label>
                <Select
                  value={watch("payment_method")}
                  onValueChange={(v) => setValue("payment_method", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not set yet" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Draft day</Label>
                <Select
                  value={watch("draft_date")}
                  onValueChange={(v) => setValue("draft_date", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not set yet" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Capped at 28 so the day exists in February too — a draft
                      that skips a month is a lapse waiting to happen. */}
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {ordinalDay(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {ssHint && (
                <div className="col-span-2 -mt-1">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {ssHint.text}{" "}
                    {ssHint.day !== Number(watch("draft_date")) && (
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => setValue("draft_date", String(ssHint.day))}
                      >
                        Use the {ordinalDay(ssHint.day)}
                      </button>
                    )}
                  </p>
                </div>
              )}
              <div className="col-span-2">
                <Label>Policy Status *</Label>
                <Select value={watch("status")} onValueChange={(v) => setValue("status", v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issued_not_paid">Issued, Not Paid</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Annual Premium</Label>
                <div className="px-3 py-2 bg-muted rounded-md text-success font-semibold">
                  {money(annual)} / year
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Beneficiaries */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Beneficiaries{" "}
                  <span className="text-muted-foreground font-normal">(Optional)</span>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    append({
                      first_name: "",
                      last_name: "",
                      relationship: "",
                      dob: "",
                      percentage: "",
                    })
                  }
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Beneficiary
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.map((f, idx) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <Label className="text-xs">First</Label>
                    <Input {...register(`beneficiaries.${idx}.first_name`)} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Last</Label>
                    <Input {...register(`beneficiaries.${idx}.last_name`)} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Relation</Label>
                    <Select
                      value={watch(`beneficiaries.${idx}.relationship`)}
                      onValueChange={(v) => setValue(`beneficiaries.${idx}.relationship`, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIPS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">DOB</Label>
                    <Input type="date" {...register(`beneficiaries.${idx}.dob`)} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">%</Label>
                    <Input type="number" {...register(`beneficiaries.${idx}.percentage`)} />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="col-span-1"
                    onClick={() => remove(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {fields.length > 0 && (
                <div
                  className={`text-sm ${benValid ? "text-muted-foreground" : "text-destructive font-medium"}`}
                >
                  Total: {benPctSum}% {!benValid && "— must equal 100%"}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Notes <span className="text-muted-foreground font-normal">(Optional)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                {...register("notes")}
                maxLength={2000}
                placeholder="Any additional notes about this deal, client health, or application details..."
                rows={4}
              />
              <div className="text-xs text-muted-foreground text-right mt-1">
                {notes.length} / 2000
              </div>
            </CardContent>
          </Card>

          <PostDealQaButton
            buildPayload={() => {
              const v = form.getValues();
              if (!v.carrier_id || !v.product || !v.monthly_premium) return null;
              return {
                client: {
                  first_name: v.first_name,
                  last_name: v.last_name,
                  phone: v.phone,
                  date_of_birth: v.date_of_birth,
                },
                policy: {
                  carrier_name: selectedCarrierName,
                  product: v.product,
                  policy_number: v.policy_number,
                  effective_date: v.effective_date,
                  face_amount: Number(v.face_amount || 0),
                  monthly_premium: Number(v.monthly_premium || 0),
                },
                beneficiaries: v.beneficiaries.map((b) => ({
                  first_name: b.first_name,
                  last_name: b.last_name,
                  relationship: b.relationship,
                  percentage: Number(b.percentage || 0),
                })),
                notes: v.notes,
              };
            }}
          />

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={mutation.isPending}>
              {mutation.isPending ? "Posting..." : "Post Deal"}
            </Button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
