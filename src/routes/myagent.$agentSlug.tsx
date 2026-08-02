import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Phone, ShieldCheck, MapPin, Check } from "lucide-react";
import { getPublicAgentPage } from "@/lib/public-agent-page.functions";


/**
 * An agent's public page.
 *
 * Its whole job is to be found and to convert, and until now it did neither
 * well. The data was fetched in a useEffect, so a crawler or a link preview
 * got the string "Loading…" — and every agent on the platform shared one
 * title, "Licensed Life Insurance Agent — Agent Cloud", with no name and no
 * image. Shared to Facebook, an agent's own page previewed as nothing.
 *
 * So the fetch is a loader now and the head is built per agent. That matters
 * more than any of the styling below it.
 */

type AgentPage = {
  name: string;
  slug: string;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  specialties: string[];
  carriers: string[];
  licensed_states: string[];
};

export const Route = createFileRoute("/myagent/$agentSlug")({
  loader: async ({ params }) => {
    const data = await getPublicAgentPage({ data: { slug: params.agentSlug } });
    if (!data) throw notFound();
    return data as AgentPage;
  },


  head: ({ loaderData }) => {
    const d = loaderData as AgentPage | undefined;
    if (!d) return { meta: [{ title: "Agent not found" }] };

    const where = d.licensed_states.length
      ? ` in ${d.licensed_states.slice(0, 3).join(", ")}`
      : "";
    const title = `${d.name} — Life Insurance${where}`;
    const description =
      (d.message ?? "").trim().slice(0, 155) ||
      `Talk to ${d.name} about life insurance. Free quote, no obligation.`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        // Without these an agent sharing their own link posts a blank card.
        { property: "og:type", content: "profile" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(d.avatar_url ? [{ property: "og:image", content: d.avatar_url }] : []),
        { name: "twitter:card", content: d.avatar_url ? "summary_large_image" : "summary" },
      ],
    };
  },

  component: PublicAgentPage,
  notFoundComponent: () => (
    <Shell>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-muted-foreground mt-1">This agent page is not available.</p>
    </Shell>
  ),
  errorComponent: () => (
    <Shell><p className="text-muted-foreground">Something went wrong.</p></Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center p-6 text-center">{children}</div>;
}

function PublicAgentPage() {
  const d = Route.useLoaderData() as AgentPage;
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  // The form is seven fields. Asking for all of them before somebody has
  // decided to get in touch is most of why a page like this gets abandoned,
  // so the rest appears once they start.
  const [expanded, setExpanded] = useState(false);

  const initials = d.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-border-soft">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: "radial-gradient(60% 80% at 50% 0%, var(--gold-glow), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-4xl px-6 pt-14 pb-10 md:pt-20 md:pb-14 text-center">
          <div className="mx-auto mb-5 h-28 w-28 md:h-32 md:w-32">
            {d.avatar_url ? (
              <img
                src={d.avatar_url}
                alt={d.name}
                className="h-full w-full rounded-full object-cover ring-2 ring-primary/30"
              />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-full bg-surface-2 text-3xl font-bold ring-2 ring-primary/30">
                {initials}
              </div>
            )}
          </div>

          <h1
            className="text-3xl md:text-5xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {d.name}
          </h1>
          <p className="mt-2 text-base md:text-lg text-muted-foreground">
            Licensed life insurance agent
          </p>

          {/* Only the trust signals the data actually supports. */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {d.licensed_states.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-gold-bright" />
                Licensed in {d.licensed_states.length} state{d.licensed_states.length === 1 ? "" : "s"}
              </span>
            )}
            {d.carriers.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-gold-bright" />
                {d.carriers.length} carrier{d.carriers.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="min-w-[190px]">
              <a href="#quote">Get a free quote</a>
            </Button>
            {d.phone && (
              <Button asChild size="lg" variant="outline">
                <a href={`tel:${d.phone}`}><Phone className="mr-1.5 h-4 w-4" /> Call {d.phone}</a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 space-y-12">
        {d.message && (
          <section className="mx-auto max-w-2xl text-center">
            <p className="whitespace-pre-line text-lg leading-relaxed text-foreground/90">
              {d.message}
            </p>
          </section>
        )}

        {d.specialties.length > 0 && (
          <section>
            <h2 className="text-center text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              What I help with
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {d.specialties.map((s) => (
                <div
                  key={s}
                  className="flex items-start gap-2.5 rounded-[var(--radius)] border border-border bg-card p-4"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" />
                  <span className="text-sm font-medium">{s}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {d.carriers.length > 0 && (
          <section className="text-center">
            {/* Deliberately worded as "I work with", not presented as a
                partnership or endorsement — the same line the marketing-site
                audit flags on the carrier logo bar. */}
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Carriers I work with
            </h2>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {d.carriers.map((c) => (
                <span key={c} className="text-sm font-medium text-foreground/70">{c}</span>
              ))}
            </div>
          </section>
        )}

        {/* ── Quote ──────────────────────────────────────────────────────── */}
        <section id="quote" className="scroll-mt-8">
          <div className="mx-auto max-w-xl rounded-[var(--radius)] border border-primary/25 bg-card p-6 md:p-8">
            {submitted ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-gold-glow text-gold-bright">
                  <Check className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  Thanks — I'll be in touch soon.
                </h2>
                <p className="mt-1 text-muted-foreground">
                  Expect a call or email within one business day.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  Get a free quote
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  No obligation. {d.name.split(" ")[0]} will reach out personally.
                </p>

                <form onSubmit={onSubmit} className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">First name *</Label>
                    <Input name="first_name" required maxLength={60} onFocus={() => setExpanded(true)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last name *</Label>
                    <Input name="last_name" required maxLength={60} onFocus={() => setExpanded(true)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone *</Label>
                    <Input name="phone" type="tel" required maxLength={30} onFocus={() => setExpanded(true)} />
                  </div>
                  {/* Email stays visible: the endpoint requires it, and a
                      `required` field inside a hidden block makes the browser
                      refuse to submit with "not focusable" rather than
                      pointing at anything the person can fix. */}
                  <div className="space-y-1">
                    <Label className="text-xs">Email *</Label>
                    <Input name="email" type="email" required maxLength={120} onFocus={() => setExpanded(true)} />
                  </div>

                  {/* The optional three. Hidden until somebody has started,
                      because seven fields at once is most of why a page like
                      this gets abandoned. */}
                  {expanded && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">State</Label>
                        <Input name="state" maxLength={2} placeholder="TX" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Best time to call</Label>
                        <Input name="best_time" maxLength={60} placeholder="Evenings" />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">What can I help you with?</Label>
                        <Input name="topic" maxLength={120} />
                      </div>
                    </>
                  )}

                  <Button type="submit" size="lg" className="sm:col-span-2 mt-1" disabled={loading}>
                    {loading ? "Sending…" : "Request my free quote"}
                  </Button>
                </form>
              </>
            )}
          </div>
        </section>

        {d.licensed_states.length > 0 && (
          <section className="text-center">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Licensed in
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
              {d.licensed_states.join(" · ")}
            </p>
          </section>
        )}
      </main>

      <footer className="border-t border-border-soft py-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 text-sm text-muted-foreground">
          {d.phone && (
            <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <Phone className="h-4 w-4" />{d.phone}
            </a>
          )}
          {d.email && (
            <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <Mail className="h-4 w-4" />{d.email}
            </a>
          )}
        </div>
      </footer>

      {/* Most of this traffic arrives on a phone, where the call button has
          scrolled away by the time somebody decides. */}
      {d.phone && !submitted && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur md:hidden">
          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <a href={`tel:${d.phone}`}><Phone className="mr-1.5 h-4 w-4" /> Call</a>
            </Button>
            <Button asChild className="flex-1">
              <a href="#quote">Get a quote</a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
