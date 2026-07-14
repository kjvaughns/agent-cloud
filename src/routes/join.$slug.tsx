import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Cloud, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/join/$slug")({
  head: () => ({
    meta: [
      { title: "Recruiting Funnel — Agent Cloud" },
      { name: "description", content: "Get contracted and start writing business in days." },
    ],
  }),
  component: JoinPage,
  notFoundComponent: () => <div className="p-12 text-center">Funnel not found.</div>,
});

function JoinPage() {
  const { slug } = Route.useParams();
  const [data, setData] = useState<any | null | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/page-data?type=funnel&slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : { data: null }))
      .then((json) => alive && setData(json.data ?? null))
      .catch(() => alive && setData(null));
    fetch("/api/public/funnel-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);

  if (data === undefined) return <div className="p-12 text-center">Loading…</div>;
  if (!data) return <div className="p-12 text-center">This recruiting page isn't available.</div>;

  const agentName = `${data.agent?.first_name ?? ""} ${data.agent?.last_name ?? ""}`.trim() || "Our Team";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const body = {
      slug,
      first_name: String(form.get("first_name") ?? ""),
      last_name: String(form.get("last_name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      state: String(form.get("state") ?? ""),
      npn_number: String(form.get("npn_number") ?? ""),
      message: String(form.get("message") ?? ""),
    };
    const res = await fetch("/api/public/funnel-apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) setSubmitted(true);
    else setError("Something went wrong. Please try again.");
  }

  if (submitted) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-950 to-slate-900 text-white p-6">
        <Card className="max-w-md p-8 text-center bg-white/10 border-white/20 text-white">
          <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-emerald-400" />
          <h1 className="text-2xl font-bold mb-2">Application Received!</h1>
          <p className="text-white/80">We'll be in touch shortly.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <header className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="h-7 w-7" />
          <span className="font-semibold">Agent Cloud</span>
        </div>
        {data.agent?.avatar_url && (
          <img src={data.agent.avatar_url} alt={agentName} className="h-12 w-12 rounded-full border-2 border-white/20" />
        )}
      </header>
      <main className="max-w-4xl mx-auto px-6 pb-16">
        <section className="py-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Get Contracted With {agentName}'s Team</h1>
          <p className="text-xl text-white/80">Start Writing Business in as Little as 3-5 Days</p>
        </section>
        <section className="grid md:grid-cols-2 gap-3 mb-12">
          {[
            "Same-week contracting available",
            "Competitive commission levels",
            "Free training and sales support",
            "No minimums, no fees",
          ].map((b) => (
            <div key={b} className="flex items-start gap-2 text-white/90">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
              <span>{b}</span>
            </div>
          ))}
        </section>
        <Card className="p-6 md:p-8 bg-white/5 border-white/10">
          <h2 className="text-2xl font-bold mb-6 text-white">Get Started</h2>
          <form onSubmit={onSubmit} className="space-y-4 [&_label]:text-white/80 [&_input]:bg-white/10 [&_input]:border-white/20 [&_input]:text-white [&_textarea]:bg-white/10 [&_textarea]:border-white/20 [&_textarea]:text-white">
            <div className="grid md:grid-cols-2 gap-4">
              <div><Label htmlFor="first_name">First Name *</Label><Input id="first_name" name="first_name" required maxLength={60} /></div>
              <div><Label htmlFor="last_name">Last Name *</Label><Input id="last_name" name="last_name" required maxLength={60} /></div>
              <div><Label htmlFor="email">Email *</Label><Input id="email" name="email" type="email" required maxLength={120} /></div>
              <div><Label htmlFor="phone">Phone *</Label><Input id="phone" name="phone" type="tel" required maxLength={30} /></div>
              <div><Label htmlFor="state">State *</Label><Input id="state" name="state" required maxLength={60} /></div>
              <div><Label htmlFor="npn_number">NPN Number (optional)</Label><Input id="npn_number" name="npn_number" maxLength={40} /></div>
            </div>
            <div>
              <Label htmlFor="message">Message (optional)</Label>
              <textarea id="message" name="message" maxLength={2000} rows={3} className="flex w-full rounded-md border px-3 py-2 text-sm" />
            </div>
            {error && <p className="text-red-300 text-sm">{error}</p>}
            <Button type="submit" disabled={busy} size="lg" className="w-full bg-white text-slate-900 hover:bg-white/90">
              {busy ? "Submitting..." : "Submit Application"}
            </Button>
          </form>
        </Card>
        <p className="text-center mt-6 text-white/60 text-sm">
          Already contracted? <Link to="/login" className="underline">Sign in →</Link>
        </p>
      </main>
    </div>
  );
}
