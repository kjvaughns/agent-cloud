import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Phone, Mail } from "lucide-react";
import { getTemplate, type LandingTemplate } from "@/lib/landing-templates";

const getLanding = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ agentSlug: z.string().min(1).max(80), templateSlug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { data: agent } = await supabaseAdmin
      .from("profiles")
      .select("id,first_name,last_name,email,phone,avatar_url")
      .eq("agent_slug", data.agentSlug)
      .maybeSingle();
    if (!agent) return null;
    const { data: page } = await supabaseAdmin
      .from("landing_pages")
      .select("id,template_slug,published,title")
      .eq("agent_id", agent.id)
      .eq("template_slug", data.templateSlug)
      .maybeSingle();
    if (!page || !page.published) return null;
    return { agent, page };
  });

export const Route = createFileRoute("/agent/$agentSlug/$templateSlug")({
  loader: ({ params }) => getLanding({ data: { agentSlug: params.agentSlug, templateSlug: params.templateSlug } }),
  head: ({ loaderData, params }) => {
    const tpl = getTemplate(params.templateSlug);
    return {
      meta: [
        { title: tpl?.headline ?? "Landing Page" },
        { name: "description", content: tpl?.subhead ?? "Get a free quote today." },
      ],
    };
  },
  component: LandingPage,
  notFoundComponent: () => <div className="p-12 text-center">Page not found.</div>,
});

function LandingPage() {
  const data = Route.useLoaderData();
  const { agentSlug, templateSlug } = Route.useParams();
  const tpl = getTemplate(templateSlug) as LandingTemplate | undefined;
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!data || !tpl) return <div className="p-12 text-center">This page isn't available.</div>;

  const agentName = `${data.agent.first_name ?? ""} ${data.agent.last_name ?? ""}`.trim();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const body = {
      agent_slug: agentSlug,
      template_slug: templateSlug,
      first_name: String(form.get("first_name") ?? ""),
      last_name: String(form.get("last_name") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),
      state: String(form.get("state") ?? ""),
      best_time: String(form.get("best_time") ?? ""),
    };
    const res = await fetch("/api/public/lead-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) setSubmitted(true);
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${tpl.gradient} text-white`}>
      <header className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="font-semibold text-lg">{agentName}</div>
        <div className="flex gap-4 text-sm text-white/80">
          {data.agent.phone && <a href={`tel:${data.agent.phone}`} className="flex items-center gap-1"><Phone className="h-4 w-4" />{data.agent.phone}</a>}
          {data.agent.email && <a href={`mailto:${data.agent.email}`} className="flex items-center gap-1"><Mail className="h-4 w-4" />{data.agent.email}</a>}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 pb-16">
        <section className="py-12 text-center">
          <span className={`inline-block px-3 py-1 rounded-full bg-white/10 text-sm mb-4 ${tpl.accent}`}>{tpl.category}</span>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 max-w-3xl mx-auto">{tpl.headline}</h1>
          <p className="text-xl text-white/80 max-w-2xl mx-auto">{tpl.subhead}</p>
        </section>
        <section className="grid md:grid-cols-3 gap-4 mb-12 max-w-4xl mx-auto">
          {tpl.bullets.map((b) => (
            <div key={b} className="bg-white/10 rounded-lg p-4 flex items-start gap-2">
              <CheckCircle2 className={`h-5 w-5 mt-0.5 shrink-0 ${tpl.accent}`} />
              <span className="text-white/90">{b}</span>
            </div>
          ))}
        </section>
        <Card className="max-w-2xl mx-auto p-6 md:p-8 bg-white text-slate-900">
          {submitted ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-emerald-500" />
              <h2 className="text-2xl font-bold mb-2">Thanks!</h2>
              <p className="text-slate-600">{agentName} will reach out shortly.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <h2 className="text-2xl font-bold mb-2">Get started</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label htmlFor="first_name">First Name *</Label><Input id="first_name" name="first_name" required maxLength={60} /></div>
                <div><Label htmlFor="last_name">Last Name *</Label><Input id="last_name" name="last_name" required maxLength={60} /></div>
                <div><Label htmlFor="phone">Phone *</Label><Input id="phone" name="phone" type="tel" required maxLength={30} /></div>
                <div><Label htmlFor="email">Email *</Label><Input id="email" name="email" type="email" required maxLength={120} /></div>
                <div><Label htmlFor="state">State</Label><Input id="state" name="state" maxLength={60} /></div>
                <div><Label htmlFor="best_time">Best time to call</Label><Input id="best_time" name="best_time" maxLength={60} placeholder="Mornings, weekends..." /></div>
              </div>
              <Button type="submit" disabled={busy} size="lg" className="w-full">{busy ? "Submitting..." : tpl.ctaLabel}</Button>
            </form>
          )}
        </Card>
        <p className="text-center mt-6 text-white/60 text-sm">
          <Link to="/login" className="underline">Agent login →</Link>
        </p>
      </main>
    </div>
  );
}
