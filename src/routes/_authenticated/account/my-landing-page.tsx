import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Eye, Globe, Sparkles, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getLandingPage, saveLandingPage, setLandingPublished, generateBioAi } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/account/my-landing-page")({
  head: () => ({
    meta: [
      { title: "My Landing Page — Agent Cloud" },
      { name: "description", content: "Customize your public-facing agent profile." },
    ],
  }),
  component: MyLandingPage,
});

const ALL_SPECIALTIES = ["Final Expense", "Mortgage Protection", "Income Replacement", "Living Benefits", "Health Insurance", "Retirement Planning"];
const ALL_CARRIERS = ["Prudential", "Combined", "Foresters", "Transamerica", "Aflac", "Mutual of Omaha", "American Amicable", "Baltimore Life", "National Life Group", "Royal Neighbors", "Athene Annuity"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function MyLandingPage() {
  const qc = useQueryClient();
  const getLandingPageFn = useServerFn(getLandingPage);
  const saveLandingPageFn = useServerFn(saveLandingPage);
  const setPublishedFn = useServerFn(setLandingPublished);
  const generateBioFn = useServerFn(generateBioAi);

  const { data, isLoading } = useQuery({
    queryKey: ["landing-page"],
    queryFn: () => getLandingPageFn(),
  });

  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (data) {
      const p = data.page;
      const prof = data.profile;
      setContactEmail(p?.contact_email ?? prof?.email ?? "");
      setContactPhone(p?.contact_phone ?? prof?.phone ?? "");
      setBio(p?.custom_message ?? "");
      setSpecialties(p?.specialties ?? []);
      setCarriers(p?.carriers ?? []);
      setStates(p?.licensed_states ?? []);
      setPublished(p?.published ?? false);
    }
  }, [data]);

  const slug = data?.profile?.agent_slug ?? "my-agent";
  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/agent/${slug}` : `/agent/${slug}`;

  const saveMutation = useMutation({
    mutationFn: () => saveLandingPageFn({
      data: {
        contact_email: contactEmail,
        contact_phone: contactPhone,
        custom_message: bio,
        specialties,
        carriers,
        licensed_states: states,
      },
    }),
    onSuccess: () => {
      toast.success("Landing page saved!");
      qc.invalidateQueries({ queryKey: ["landing-page"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMutation = useMutation({
    mutationFn: (val: boolean) => setPublishedFn({ data: { published: val } }),
    onSuccess: (_, val) => {
      setPublished(val);
      toast.success(val ? "Landing page published!" : "Landing page unpublished.");
      qc.invalidateQueries({ queryKey: ["landing-page"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const genBioMutation = useMutation({
    mutationFn: () => generateBioFn({ data: { specialties } }),
    onSuccess: (res) => setBio(res.bio),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSpecialty = (s: string) =>
    setSpecialties((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  const toggleCarrier = (c: string) =>
    setCarriers((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  const toggleState = (st: string) =>
    setStates((prev) => prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]);

  const initials = data?.profile
    ? `${(data.profile.first_name ?? "")[0] ?? ""}${(data.profile.last_name ?? "")[0] ?? ""}`.toUpperCase()
    : "??";

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Globe className="h-7 w-7" /> My Landing Page</h1>
          <p className="text-muted-foreground mt-1">Customize your public-facing agent profile.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { navigator.clipboard.writeText(pageUrl); toast.success("URL copied!"); }}
          >
            <Copy className="h-3 w-3 mr-1" /> Copy URL
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={pageUrl} target="_blank" rel="noopener noreferrer">
              <Eye className="h-3 w-3 mr-1" /> Preview
            </a>
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving…</> : "Save"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Landing Page Published</div>
            <div className="text-sm text-muted-foreground mt-0.5 truncate max-w-xs">{pageUrl}</div>
          </div>
          <Switch
            checked={published}
            disabled={publishMutation.isPending}
            onCheckedChange={(v) => publishMutation.mutate(v)}
          />
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Contact Email</Label>
              <Input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Leave blank to use account email"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone Number</Label>
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="e.g., (512) 555-0188"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Profile Photo</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-xl bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Button variant="outline" size="sm">Change Photo</Button>
              <p className="text-xs text-muted-foreground mt-2">Square image, 400×400px min, max 5MB</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Custom Message</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => genBioMutation.mutate()}
              disabled={genBioMutation.isPending}
            >
              {genBioMutation.isPending
                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating…</>
                : <><Sparkles className="h-3 w-3 mr-1" /> Generate with AI</>
              }
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            maxLength={500}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell prospects who you are and how you help families protect what matters most."
          />
          <div className="text-xs text-muted-foreground mt-1 text-right">{bio.length} / 500</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What I Help With</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ALL_SPECIALTIES.map((s) => (
            <Badge
              key={s}
              variant={specialties.includes(s) ? "default" : "outline"}
              className="cursor-pointer text-sm py-1"
              onClick={() => toggleSpecialty(s)}
            >
              {s}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Carriers I Represent</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ALL_CARRIERS.map((c) => (
            <Badge
              key={c}
              variant={carriers.includes(c) ? "default" : "outline"}
              className="cursor-pointer text-sm py-1"
              onClick={() => toggleCarrier(c)}
            >
              {c}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>States Licensed In</CardTitle>
            <Button variant="link" size="sm" onClick={() => setStates(states.length === US_STATES.length ? [] : [...US_STATES])}>
              {states.length === US_STATES.length ? "Deselect All" : "Select All"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {US_STATES.map((st) => (
            <Badge
              key={st}
              variant={states.includes(st) ? "default" : "outline"}
              className="text-sm py-1 gap-1 cursor-pointer"
              onClick={() => toggleState(st)}
            >
              {st}
              {states.includes(st) && (
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); toggleState(st); }}
                />
              )}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
