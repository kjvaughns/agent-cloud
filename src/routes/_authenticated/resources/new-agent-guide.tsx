import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getOnboardingStatus } from "@/lib/resources.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, ArrowRight, BookOpen, ScrollText, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources/new-agent-guide")({
  head: () => ({ meta: [{ title: "New Agent Guide — Agent Cloud" }] }),
  component: Page,
});

const STEPS: { key: keyof Steps; title: string; desc: string; href: string; cta: string }[] = [
  { key: "profile", title: "Complete Your Producer Profile", desc: "Add your NPN, date of birth, address, and personal information.", href: "/account/producer-profile", cta: "Go to Producer Profile" },
  { key: "eo", title: "Upload Your E&O Insurance", desc: "Upload your Errors & Omissions certificate. Required before contracting.", href: "/account/producer-profile", cta: "Upload E&O Certificate" },
  { key: "aml", title: "Upload Your AML Certificate", desc: "Complete free AML training and upload your certificate.", href: "/account/producer-profile", cta: "Complete AML Training" },
  { key: "banking", title: "Upload Banking Information", desc: "Add your bank account info for commission direct deposit.", href: "/account/producer-profile", cta: "Add Banking Info" },
  { key: "contract", title: "Get Your First Carrier Contract", desc: "Request a contract with your first carrier to start writing business.", href: "/contracting/carriers", cta: "Request Contract" },
  { key: "phone", title: "Add Your Phone Number", desc: "Set up your business phone number to call and text clients.", href: "/phone", cta: "Set Up Phone" },
  { key: "wallet", title: "Fund Your Wallet", desc: "Add funds to your wallet to enable SMS, calls, and AI features.", href: "/finances", cta: "Add Funds" },
  { key: "deal", title: "Post Your First Deal", desc: "Post your first policy to start tracking your book of business.", href: "/post-deal", cta: "Post a Deal" },
];

type Steps = { profile: boolean; eo: boolean; aml: boolean; banking: boolean; contract: boolean; phone: boolean; wallet: boolean; deal: boolean };

function Page() {
  const fn = useServerFn(getOnboardingStatus);
  const { data, isLoading } = useQuery({ queryKey: ["onboarding-status"], queryFn: () => fn() });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">New Agent Guide</h1>
        <p className="text-muted-foreground">Everything you need to get started and writing business fast</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Your Setup Progress</div>
            <div className="text-sm text-muted-foreground">{data?.completed ?? 0} of 8 steps complete ({data?.pct ?? 0}%)</div>
          </div>
          <Progress value={data?.pct ?? 0} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const done = data?.steps?.[step.key] ?? false;
          return (
            <Card key={step.key} className={done ? "border-green-500/40 bg-green-500/5" : ""}>
              <CardContent className="pt-6 flex items-start gap-4">
                <div className={`shrink-0 w-9 h-9 rounded-full grid place-items-center ${done ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
                  {done ? <Check className="h-5 w-5" /> : <span className="text-sm font-semibold">{i + 1}</span>}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Step {i + 1}: {step.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{step.desc}</div>
                </div>
                <Button asChild variant={done ? "outline" : "default"} size="sm">
                  <Link to={step.href}>{step.cta} <ArrowRight className="h-4 w-4 ml-1" /></Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-3 gap-4 pt-4">
        {[
          { icon: BookOpen, label: "Read the Agent Handbook", to: "/resources/agent-handbook" },
          { icon: ScrollText, label: "Review Sales Scripts", to: "/resources/scripts" },
          { icon: GraduationCap, label: "Start Agent Academy", to: "/resources/agent-academy" },
        ].map((r) => (
          <Card key={r.to} className="hover:bg-muted/40 transition">
            <Link to={r.to}>
              <CardContent className="pt-6 flex items-center gap-3">
                <r.icon className="h-6 w-6 text-primary" />
                <div className="font-medium">{r.label}</div>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">Loading status…</div>}
    </div>
  );
}
