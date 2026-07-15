import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  createRetirementCase, saveRetirementCase, listRetirementCases, getRetirementCase, searchClientsForCase,
} from "@/lib/back-office.functions";
import { project, defaultInputs, readinessScore, type RetirementInputs, type AccountRow } from "@/lib/retirement-calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Printer, Trash2, AlertTriangle, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line,
} from "recharts";
import { format } from "date-fns";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/back-office/advanced-desk")({
  head: () => ({ meta: [
    { title: "Advanced Desk — Agent Cloud" },
    { name: "description", content: "Interactive retirement planning center with projections and case management." },
  ]}),
  component: AdvancedDeskPage,
});

const ACCOUNT_TYPES = [
  ["401k", "401(k) / 403(b)", "qualified"],
  ["trad_ira", "Traditional IRA", "qualified"],
  ["roth_ira", "Roth IRA", "roth"],
  ["sep_simple", "SEP / SIMPLE IRA", "qualified"],
  ["pension", "Pension", "qualified"],
  ["annuity_q", "Annuity (Qualified)", "qualified"],
  ["457b", "457(b) Plan", "qualified"],
  ["brokerage", "Brokerage Account", "taxable"],
  ["savings", "Savings / CDs", "taxable"],
  ["annuity_nq", "Annuity (Non-Qualified)", "non_qualified"],
  ["trust", "Trust Account", "non_qualified"],
  ["real_estate", "Real Estate", "non_qualified"],
  ["business", "Business Equity", "non_qualified"],
  ["hsa", "HSA", "qualified"],
  ["money_market", "Money Market", "taxable"],
] as const;

function AdvancedDeskPage() {
  const [tab, setTab] = useState("planner");
  const [caseId, setCaseId] = useState<string | null>(null);

  return (
    <PageShell>
      <div className="space-y-6">
        <HeroBand
          title="Advanced Desk"
          subtitle="Interactive retirement projections and case management."
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="planner">Planner</TabsTrigger>
            <TabsTrigger value="tracker">Case Tracker</TabsTrigger>
            <TabsTrigger value="attention">Needs Attention</TabsTrigger>
          </TabsList>
          <TabsContent value="planner"><Planner caseId={caseId} setCaseId={setCaseId} /></TabsContent>
          <TabsContent value="tracker"><CaseTracker onOpen={(id) => { setCaseId(id); setTab("planner"); }} /></TabsContent>
          <TabsContent value="attention"><NeedsAttention onOpen={(id) => { setCaseId(id); setTab("planner"); }} /></TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}

// ---------------------- Planner ----------------------
function Planner({ caseId, setCaseId }: { caseId: string | null; setCaseId: (id: string | null) => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getRetirementCase);
  const saveFn = useServerFn(saveRetirementCase);

  const loaded = useQuery({
    queryKey: ["retirement-case", caseId],
    queryFn: () => getFn({ data: { id: caseId! } }),
    enabled: !!caseId,
  });

  const [inputs, setInputs] = useState<RetirementInputs>(defaultInputs());

  useEffect(() => {
    if (loaded.data) {
      setInputs({
        current_age: loaded.data.current_age ?? 45,
        retirement_age: loaded.data.retirement_age ?? 65,
        life_expectancy: loaded.data.life_expectancy ?? 90,
        current_savings: Number(loaded.data.current_savings ?? 0),
        monthly_contribution: Number(loaded.data.monthly_contribution ?? 0),
        expected_return_pct: Number(loaded.data.expected_return_pct ?? 6),
        inflation_pct: Number(loaded.data.inflation_pct ?? 2.5),
        healthcare_inflation_pct: Number(loaded.data.healthcare_inflation_pct ?? 5.5),
        accounts: (loaded.data.accounts as AccountRow[]) ?? [],
        income_sources: (loaded.data.income_sources as RetirementInputs["income_sources"]) ?? [],
        expenses_monthly: Number(loaded.data.expenses_monthly ?? 4500),
        healthcare_monthly: Number(loaded.data.healthcare_monthly ?? 600),
      });
    }
  }, [loaded.data]);

  const result = useMemo(() => project(inputs), [inputs]);

  // Auto-save debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!caseId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveFn({ data: {
        id: caseId,
        ...inputs,
        linked_policy_ids: [],
        projected_nest_egg: result.nest_egg,
        projected_monthly_income: result.monthly_income,
        withdrawal_rate_pct: result.withdrawal_rate_pct,
        success_probability_pct: result.success_probability_pct,
        status: "draft",
      }}).then(() => qc.invalidateQueries({ queryKey: ["retirement-cases"] })).catch(() => {});
    }, 2000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [inputs, caseId, result, saveFn, qc]);

  const successColor = result.success_probability_pct >= 80 ? "text-success" : result.success_probability_pct >= 60 ? "text-warning" : "text-destructive";

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-6">
      {/* Left input panel */}
      <Panel
        title="Inputs"
        action={caseId ? <Badge variant="outline" className="text-xs">Auto-saving</Badge> : undefined}
        className="lg:sticky lg:top-4 lg:self-start max-h-[calc(100vh-6rem)] overflow-y-auto"
      >
        <div className="space-y-4">
          {!caseId && (
            <div className="text-xs text-muted-foreground p-2 rounded bg-surface-2">
              Scratch mode — go to <b>Case Tracker</b> to save your work.
            </div>
          )}

          <Section title="Demographics">
            <NumField label="Current Age" v={inputs.current_age} onChange={(v) => setInputs({ ...inputs, current_age: v })} />
            <NumField label="Retirement Age" v={inputs.retirement_age} onChange={(v) => setInputs({ ...inputs, retirement_age: v })} />
            <NumField label="Life Expectancy" v={inputs.life_expectancy} onChange={(v) => setInputs({ ...inputs, life_expectancy: v })} />
          </Section>

          <Section title="Savings & Growth">
            <NumField label="Current Savings ($)" v={inputs.current_savings} onChange={(v) => setInputs({ ...inputs, current_savings: v })} />
            <NumField label="Monthly Contribution ($)" v={inputs.monthly_contribution} onChange={(v) => setInputs({ ...inputs, monthly_contribution: v })} />
            <AssumptionsModal inputs={inputs} setInputs={setInputs} />
          </Section>

          <Section title="Expenses">
            <NumField label="Monthly Expenses ($)" v={inputs.expenses_monthly} onChange={(v) => setInputs({ ...inputs, expenses_monthly: v })} />
            <NumField label="Healthcare ($/mo)" v={inputs.healthcare_monthly} onChange={(v) => setInputs({ ...inputs, healthcare_monthly: v })} />
          </Section>

          <Section title="Accounts">
            <AccountList inputs={inputs} setInputs={setInputs} />
            <div className="text-xs space-y-1 mt-2 pt-2 border-t border-border-soft">
              <Row k="Total Balance" v={`$${Math.round(result.total_balance).toLocaleString()}`} />
              <Row k="Monthly Contrib." v={`$${Math.round(result.total_monthly_contrib).toLocaleString()}`} />
              <Row k="Weighted Return" v={`${result.weighted_return_pct.toFixed(1)}%`} />
              <Row k="Qualified" v={`$${Math.round(result.qualified_total).toLocaleString()}`} />
              <Row k="Non-Qualified" v={`$${Math.round(result.non_qualified_total).toLocaleString()}`} />
            </div>
          </Section>
        </div>
      </Panel>

      {/* Right panel */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Metric label="NEST EGG" value={`$${Math.round(result.nest_egg).toLocaleString()}`} />
          <Metric label="MONTHLY INCOME" value={`$${Math.round(result.monthly_income).toLocaleString()}`} />
          <Metric label="WITHDRAWAL RATE" value={`${result.withdrawal_rate_pct.toFixed(1)}%`} />
          <Metric label="SUCCESS PROB." value={`${Math.round(result.success_probability_pct)}%`} valueClass={successColor} />
          <Metric label="LASTS TO" value={result.lasts_to_age >= inputs.life_expectancy ? `Age ${inputs.life_expectancy}+` : `Age ${result.lasts_to_age}`} />
        </div>

        <Tabs defaultValue="summary">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="whatif">What-If</TabsTrigger>
            <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
            <TabsTrigger value="report">Report</TabsTrigger>
            {["Risk", "Income", "Expenses", "Taxes", "Health", "Roth", "Floor", "Legacy", "Scenarios"].map((t) => (
              <TabsTrigger key={t} value={t.toLowerCase()} className="opacity-60">{t}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="summary"><SummaryTab inputs={inputs} result={result} /></TabsContent>
          <TabsContent value="whatif"><WhatIfTab base={inputs} /></TabsContent>
          <TabsContent value="cashflow"><CashFlowTab result={result} /></TabsContent>
          <TabsContent value="report"><ReportTab inputs={inputs} result={result} /></TabsContent>
          {["risk", "income", "expenses", "taxes", "health", "roth", "floor", "legacy", "scenarios"].map((t) => (
            <TabsContent key={t} value={t}>
              <Panel><div className="p-6 text-center text-muted-foreground">
                This analysis module is coming soon. Use the Summary, What-If, and Cash Flow tabs above for full projections in the meantime.
              </div></Panel>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
function NumField({ label, v, onChange }: { label: string; v: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={v} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-8 tnum" />
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium tnum">{v}</span></div>;
}
function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col justify-center rounded-[var(--radius)] border border-border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{label}</div>
      <div className={`tnum font-display font-bold mt-1.5 text-[22px] leading-none ${valueClass ?? "text-foreground"}`} style={{ fontFamily: "var(--font-display)" }}>{value}</div>
    </div>
  );
}

function AssumptionsModal({ inputs, setInputs }: { inputs: RetirementInputs; setInputs: (i: RetirementInputs) => void }) {
  const [draft, setDraft] = useState(inputs);
  useEffect(() => setDraft(inputs), [inputs]);
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="link" size="sm" className="px-0 h-auto">⚙️ Edit Assumptions</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Assumptions</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <NumField label="Expected Return %" v={draft.expected_return_pct} onChange={(v) => setDraft({ ...draft, expected_return_pct: v })} />
          <NumField label="Inflation %" v={draft.inflation_pct} onChange={(v) => setDraft({ ...draft, inflation_pct: v })} />
          <NumField label="Healthcare Inflation %" v={draft.healthcare_inflation_pct} onChange={(v) => setDraft({ ...draft, healthcare_inflation_pct: v })} />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDraft({ ...draft, expected_return_pct: 6, inflation_pct: 2.5, healthcare_inflation_pct: 5.5 })}>Reset</Button>
            <Button onClick={() => setInputs({ ...inputs, ...draft })}>Apply</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountList({ inputs, setInputs }: { inputs: RetirementInputs; setInputs: (i: RetirementInputs) => void }) {
  const addAccount = (type: string, name: string, taxClass: AccountRow["tax_class"]) => {
    setInputs({
      ...inputs,
      accounts: [...inputs.accounts, {
        id: crypto.randomUUID(), type, name, balance: 0, monthly_contrib: 0,
        return_pct: inputs.expected_return_pct, tax_class: taxClass,
      }],
    });
  };
  const updateAccount = (id: string, patch: Partial<AccountRow>) => {
    setInputs({ ...inputs, accounts: inputs.accounts.map((a) => a.id === id ? { ...a, ...patch } : a) });
  };
  const removeAccount = (id: string) => setInputs({ ...inputs, accounts: inputs.accounts.filter((a) => a.id !== id) });

  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full"><Plus className="h-3 w-3 mr-1" /> Add Account</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-72 overflow-y-auto">
          {ACCOUNT_TYPES.map(([type, name, tax]) => (
            <DropdownMenuItem key={type} onClick={() => addAccount(type, name, tax as AccountRow["tax_class"])}>{name}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {inputs.accounts.map((a) => (
        <div key={a.id} className="rounded-[var(--radius)] border border-border-soft bg-surface-2 p-2 space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium truncate">{a.name}</span>
            <button onClick={() => removeAccount(a.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <Input className="h-7 text-xs tnum" placeholder="Balance" type="number" value={a.balance || ""} onChange={(e) => updateAccount(a.id, { balance: Number(e.target.value) || 0 })} />
            <Input className="h-7 text-xs tnum" placeholder="$/mo" type="number" value={a.monthly_contrib || ""} onChange={(e) => updateAccount(a.id, { monthly_contrib: Number(e.target.value) || 0 })} />
            <Input className="h-7 text-xs tnum" placeholder="Return %" type="number" value={a.return_pct} onChange={(e) => updateAccount(a.id, { return_pct: Number(e.target.value) || 0 })} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryTab({ inputs, result }: { inputs: RetirementInputs; result: ReturnType<typeof project> }) {
  const score = readinessScore(result);
  const color = score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-destructive";
  const actions: string[] = [];
  if (result.success_probability_pct < 80) actions.push("Increase monthly contribution by $200-500 to boost long-term success.");
  if (result.withdrawal_rate_pct > 5) actions.push("Withdrawal rate exceeds 5% — consider delaying retirement or adding guaranteed income.");
  if (inputs.income_sources.filter((s) => s.type === "annuity").length === 0 && result.success_probability_pct < 75) actions.push("Consider an annuity to add guaranteed lifetime income.");
  if (inputs.healthcare_monthly < 800) actions.push("Healthcare cost estimate may be low — review for retirees age 65+.");
  if (actions.length === 0) actions.push("On track — continue current strategy and revisit annually.");

  return (
    <Panel><div className="space-y-6">
      <div className="flex items-center gap-6">
        <div className="relative h-32 w-32">
          <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="none" className="text-muted" />
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="none"
              className={color} strokeDasharray={`${(score / 100) * 283} 283`} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-3xl font-bold tnum font-display ${color}`} style={{ fontFamily: "var(--font-display)" }}>{score}</div>
            <div className="text-[10px] uppercase tracking-[0.07em] text-muted-foreground">Readiness</div>
          </div>
        </div>
        <div className="flex-1">
          <h3 className="font-display font-semibold mb-2" style={{ fontFamily: "var(--font-display)" }}>Key Finding</h3>
          <p className="text-sm text-muted-foreground">
            Based on your inputs, your portfolio is projected to reach <b>${Math.round(result.nest_egg).toLocaleString()}</b> at age {inputs.retirement_age},
            supporting roughly <b>${Math.round(result.monthly_income).toLocaleString()}/month</b> in safe withdrawals.
            {" "}With a {Math.round(result.success_probability_pct)}% success probability, your assets are projected to last to age {result.lasts_to_age}.
          </p>
        </div>
      </div>
      <div>
        <h3 className="font-display font-semibold mb-2" style={{ fontFamily: "var(--font-display)" }}>Recommended Actions</h3>
        <ol className="space-y-1 text-sm list-decimal list-inside">
          {actions.slice(0, 3).map((a) => <li key={a}>{a}</li>)}
        </ol>
      </div>
    </div></Panel>
  );
}

function WhatIfTab({ base }: { base: RetirementInputs }) {
  const [retireDelta, setRetireDelta] = useState(0);
  const [contribDelta, setContribDelta] = useState(0);
  const [returnPct, setReturnPct] = useState(base.expected_return_pct);

  const modified: RetirementInputs = {
    ...base,
    retirement_age: base.retirement_age + retireDelta,
    monthly_contribution: base.monthly_contribution + contribDelta,
    expected_return_pct: returnPct,
  };
  const baseResult = useMemo(() => project(base), [base]);
  const modResult = useMemo(() => project(modified), [modified]);

  const data = modResult.years.map((y, i) => ({
    age: y.age,
    base: Math.round(baseResult.years[i]?.portfolio_end ?? 0),
    modified: Math.round(y.portfolio_end),
  }));

  return (
    <Panel><div className="space-y-6">
      <SliderRow label={`Retire ${retireDelta >= 0 ? "+" : ""}${retireDelta} years`}
        v={retireDelta} min={-5} max={5} onChange={setRetireDelta} />
      <SliderRow label={`Contribute ${contribDelta >= 0 ? "+$" : "-$"}${Math.abs(contribDelta)}/mo`}
        v={contribDelta} min={-500} max={500} step={50} onChange={setContribDelta} />
      <SliderRow label={`Expected return ${returnPct.toFixed(1)}%`}
        v={returnPct} min={2} max={10} step={0.5} onChange={setReturnPct} />

      <div className="text-sm rounded-[var(--radius)] border border-border-soft p-3 bg-surface-2 tnum">
        Nest egg: <b>${Math.round(modResult.nest_egg).toLocaleString()}</b>
        {" "}({modResult.nest_egg - baseResult.nest_egg >= 0 ? "+" : ""}${Math.round(modResult.nest_egg - baseResult.nest_egg).toLocaleString()} vs base).
        Success: <b>{Math.round(modResult.success_probability_pct)}%</b>.
      </div>

      <div className="h-72">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="age" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="var(--color-muted-foreground)" fontSize={12} />
            <Tooltip
              contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
              formatter={(v: number) => `$${v.toLocaleString()}`} />
            <Line type="monotone" dataKey="base" stroke="var(--color-muted-foreground)" strokeDasharray="4 4" dot={false} name="Base" />
            <Line type="monotone" dataKey="modified" stroke="var(--color-primary)" dot={false} name="What-If" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div></Panel>
  );
}
function SliderRow({ label, v, min, max, step = 1, onChange }: { label: string; v: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="text-sm font-medium mb-2">{label}</div>
      <Slider value={[v]} min={min} max={max} step={step} onValueChange={(arr) => onChange(arr[0])} />
    </div>
  );
}

function CashFlowTab({ result }: { result: ReturnType<typeof project> }) {
  const data = result.years.map((y) => ({
    age: y.age,
    portfolio: Math.round(y.portfolio_end),
    guaranteed: Math.round(y.guaranteed_income),
    withdrawals: Math.round(y.withdrawals),
  }));
  return (
    <div className="space-y-4">
      <Panel pad={false}><div className="p-4 h-80">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="age" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="var(--color-muted-foreground)" fontSize={12} />
            <Tooltip
              contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
              formatter={(v: number) => `$${v.toLocaleString()}`} />
            <Area type="monotone" dataKey="portfolio" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.2} name="Portfolio" />
            <Area type="monotone" dataKey="guaranteed" stroke="var(--color-success)" fill="var(--color-success)" fillOpacity={0.2} name="Guaranteed Income" />
            <Area type="monotone" dataKey="withdrawals" stroke="var(--color-destructive)" fill="var(--color-destructive)" fillOpacity={0.2} name="Withdrawals" />
          </AreaChart>
        </ResponsiveContainer>
      </div></Panel>
      <Panel pad={false}>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-xs tnum">
            <thead className="sticky top-0 bg-surface-2 backdrop-blur"><tr>
              <th className="text-left p-2">Age</th><th className="text-left p-2">Year</th><th className="text-right p-2">Start</th>
              <th className="text-right p-2">Contrib.</th><th className="text-right p-2">Withdrawals</th><th className="text-right p-2">End</th>
            </tr></thead>
            <tbody>
              {result.years.map((y) => (
                <tr key={y.age} className="border-t border-border-soft">
                  <td className="p-2">{y.age}</td><td className="p-2">{y.year}</td>
                  <td className="p-2 text-right">${Math.round(y.portfolio_start).toLocaleString()}</td>
                  <td className="p-2 text-right">${Math.round(y.contributions).toLocaleString()}</td>
                  <td className="p-2 text-right">${Math.round(y.withdrawals).toLocaleString()}</td>
                  <td className="p-2 text-right font-medium">${Math.round(y.portfolio_end).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function ReportTab({ inputs, result }: { inputs: RetirementInputs; result: ReturnType<typeof project> }) {
  return (
    <Panel><div className="space-y-4">
      <h3 className="text-xl font-display font-semibold" style={{ fontFamily: "var(--font-display)" }}>Client Retirement Report</h3>
      <p className="text-sm text-muted-foreground">Generate a professional summary you can share with your client. Uses your browser's print dialog — save as PDF from there.</p>
      <div className="rounded-[var(--radius)] border border-border-soft p-6 bg-surface-2 space-y-3 tnum">
        <div><b>Current Age:</b> {inputs.current_age} → Retirement at {inputs.retirement_age}, Life Expectancy {inputs.life_expectancy}</div>
        <div><b>Projected Nest Egg:</b> ${Math.round(result.nest_egg).toLocaleString()}</div>
        <div><b>Monthly Income at Retirement:</b> ${Math.round(result.monthly_income).toLocaleString()}</div>
        <div><b>Success Probability:</b> {Math.round(result.success_probability_pct)}%</div>
        <div><b>Portfolio Lasts To:</b> Age {result.lasts_to_age}</div>
      </div>
      <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Print Report</Button>
      <p className="text-xs text-muted-foreground">Disclaimer: Projections are illustrative only and based on the inputs provided. Actual results will vary.</p>
    </div></Panel>
  );
}

// ---------------------- Case Tracker ----------------------
function CaseTracker({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listRetirementCases);
  const createFn = useServerFn(createRetirementCase);
  const searchFn = useServerFn(searchClientsForCase);

  const cases = useQuery({ queryKey: ["retirement-cases"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: ["case-client-search", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (args: { client_id: string | null; title: string; current_age: number }) =>
      createFn({ data: args }),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ["retirement-cases"] });
      setOpen(false);
      onOpen(id);
      toast.success("Case created");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-display font-semibold" style={{ fontFamily: "var(--font-display)" }}>Cases</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Case</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Retirement Case</DialogTitle></DialogHeader>
            <Input placeholder="Search clients..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-64 overflow-y-auto border border-border-soft rounded-[var(--radius)]">
              {results.data?.map((c) => (
                <button key={c.id} onClick={() => {
                  const age = c.date_of_birth ? new Date().getFullYear() - new Date(c.date_of_birth).getFullYear() : 45;
                  create.mutate({ client_id: c.id, title: `${c.first_name} ${c.last_name}`, current_age: age });
                }} className="w-full text-left px-3 py-2 hover:bg-surface-2 text-sm border-b border-border-soft last:border-b-0">
                  {c.first_name} {c.last_name}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => create.mutate({ client_id: null, title: "Untitled case", current_age: 45 })}>
              Skip — create blank case
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <Panel pad={false}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2"><tr>
            <th className="text-left p-3">Client</th><th className="text-left p-3">Created</th><th className="text-left p-3">Status</th>
            <th className="text-right p-3">Nest Egg</th><th className="text-right p-3">Success</th><th className="text-left p-3">Updated</th>
          </tr></thead>
          <tbody>
            {cases.data?.map((c) => (
              <tr key={c.id} onClick={() => onOpen(c.id)} className="border-t border-border-soft hover:bg-surface-2 cursor-pointer">
                <td className="p-3">{c.client_name || c.title}</td>
                <td className="p-3 tnum">{format(new Date(c.created_at), "MMM d, yyyy")}</td>
                <td className="p-3"><Badge variant="outline">{c.status}</Badge></td>
                <td className="p-3 text-right tnum">{c.projected_nest_egg ? `$${Math.round(Number(c.projected_nest_egg)).toLocaleString()}` : "—"}</td>
                <td className="p-3 text-right tnum">{c.success_probability_pct ? `${Math.round(Number(c.success_probability_pct))}%` : "—"}</td>
                <td className="p-3 text-muted-foreground tnum">{format(new Date(c.updated_at), "MMM d")}</td>
              </tr>
            ))}
            {cases.data?.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No cases yet. Click "New Case" to start.</td></tr>
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ---------------------- Needs Attention ----------------------
function NeedsAttention({ onOpen }: { onOpen: (id: string) => void }) {
  const listFn = useServerFn(listRetirementCases);
  const cases = useQuery({ queryKey: ["retirement-cases"], queryFn: () => listFn() });

  const flagged = (cases.data ?? []).filter((c) => {
    const success = Number(c.success_probability_pct ?? 100);
    const stale = (Date.now() - new Date(c.updated_at).getTime()) > 90 * 86400 * 1000;
    const nearRetire = c.retirement_age && c.current_age && (c.retirement_age - c.current_age) <= 5;
    return success < 70 || stale || nearRetire;
  });

  return (
    <div className="space-y-3">
      {flagged.length === 0 && (
        <Panel><div className="p-6 text-center text-muted-foreground">No cases need attention. Great work!</div></Panel>
      )}
      {flagged.map((c) => {
        const success = Number(c.success_probability_pct ?? 100);
        const issues: string[] = [];
        if (success < 70) issues.push(`⚠️ Success probability is ${Math.round(success)}% — review assumptions`);
        if ((Date.now() - new Date(c.updated_at).getTime()) > 90 * 86400 * 1000) issues.push("⏰ Case not updated in 90+ days");
        if (c.retirement_age && c.current_age && (c.retirement_age - c.current_age) <= 5) issues.push(`Retirement is ${c.retirement_age - c.current_age} years away`);
        return (
          <Panel key={c.id}><div className="flex items-center gap-4">
            <AlertTriangle className="h-6 w-6 text-warning shrink-0" />
            <div className="flex-1">
              <div className="font-medium">{c.client_name || c.title}</div>
              <div className="text-sm text-muted-foreground">{issues.join(" · ")}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpen(c.id)}><FolderOpen className="h-4 w-4 mr-1" /> Open</Button>
          </div></Panel>
        );
      })}
    </div>
  );
}
