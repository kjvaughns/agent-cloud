import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Phone } from "lucide-react";

const getPublicLanding = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,first_name,last_name,email,phone,agent_slug,avatar_url")
      .eq("agent_slug", data.slug)
      .maybeSingle();
    if (!profile) return null;
    const { data: page } = await supabaseAdmin
      .from("agent_landing_pages")
      .select("published,contact_email,contact_phone,custom_message,specialties,carriers,licensed_states")
      .eq("agent_id", profile.id)
      .maybeSingle();
    if (!page?.published) return null;
    return {
      name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
      slug: profile.agent_slug,
      avatar_url: profile.avatar_url,
      email: page.contact_email || profile.email,
      phone: page.contact_phone || profile.phone,
      message: page.custom_message,
      specialties: (page.specialties as string[]) ?? [],
      carriers: (page.carriers as string[]) ?? [],
      licensed_states: (page.licensed_states as string[]) ?? [],
    };
  });

export const Route = createFileRoute("/myagent/$agentSlug")({
  loader: async ({ params }) => {
    const data = await getPublicLanding({ data: { slug: params.agentSlug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.name} — Licensed Life Insurance Agent` : "Agent" },
      { name: "description", content: loaderData?.message?.slice(0, 155) ?? "Get a free life insurance quote." },
    ],
  }),
  component: PublicAgentPage,
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-muted-foreground">This agent page is not available.</p>
      </div>
    </div>
  ),
  errorComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <p className="text-muted-foreground">Something went wrong.</p>
    </div>
  ),
});

function PublicAgentPage() {
  const d = Route.useLoaderData();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const res = await fetch("/api/public/landing-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: d.slug,
          first_name: fd.get("first_name"),
          last_name: fd.get("last_name"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          state: fd.get("state"),
          best_time: fd.get("best_time"),
          topic: fd.get("topic"),
        }),
      });
      if (!res.ok) throw new Error("submit failed");
      setSubmitted(true);
    } catch {
      toast.error("Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const initials = d.name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-3xl mx-auto p-6 md:p-10 space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            {d.avatar_url && <AvatarImage src={d.avatar_url} alt={d.name} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold">{d.name}</h1>
            <p className="text-muted-foreground">Licensed Life Insurance Agent</p>
          </div>
        </div>

        {d.message && (
          <Card><CardContent className="p-5 text-base leading-relaxed">{d.message}</CardContent></Card>
        )}

        {d.specialties.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">What I Help With</h2>
            <div className="flex flex-wrap gap-2">{d.specialties.map((s) => <Badge key={s} className="text-sm py-1">{s}</Badge>)}</div>
          </section>
        )}

        {d.carriers.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Carriers I Work With</h2>
            <div className="flex flex-wrap gap-2">{d.carriers.map((c) => <Badge key={c} variant="outline" className="text-sm py-1">{c}</Badge>)}</div>
          </section>
        )}

        {d.licensed_states.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Licensed In</h2>
            <p className="text-sm">{d.licensed_states.join(", ")}</p>
          </section>
        )}

        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-4">Get a Free Quote</h2>
            {submitted ? (
              <div className="text-center py-6">
                <h3 className="text-lg font-semibold">Thanks — I'll be in touch soon.</h3>
                <p className="text-muted-foreground mt-1">Expect a call or email within one business day.</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="grid sm:grid-cols-2 gap-3">
                <div><Label className="text-xs">First Name *</Label><Input name="first_name" required maxLength={60} /></div>
                <div><Label className="text-xs">Last Name *</Label><Input name="last_name" required maxLength={60} /></div>
                <div><Label className="text-xs">Phone *</Label><Input name="phone" type="tel" required maxLength={30} /></div>
                <div><Label className="text-xs">Email *</Label><Input name="email" type="email" required maxLength={120} /></div>
                <div><Label className="text-xs">State</Label><Input name="state" maxLength={2} placeholder="TX" /></div>
                <div><Label className="text-xs">Best Time to Call</Label><Input name="best_time" maxLength={60} placeholder="Evenings" /></div>
                <div className="sm:col-span-2"><Label className="text-xs">What can I help you with?</Label><Input name="topic" maxLength={120} /></div>
                <Button type="submit" className="sm:col-span-2" disabled={loading}>{loading ? "Sending…" : "Request My Free Quote"}</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground justify-center pt-4 border-t">
          {d.phone && <a href={`tel:${d.phone}`} className="flex items-center gap-1.5 hover:text-foreground"><Phone className="h-4 w-4" />{d.phone}</a>}
          {d.email && <a href={`mailto:${d.email}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="h-4 w-4" />{d.email}</a>}
        </div>
      </div>
    </div>
  );
}
