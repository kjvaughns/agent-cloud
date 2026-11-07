import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, Loader2, Pipette } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@/hooks/use-server-fn";
import { useOrganization } from "@/hooks/use-organization";
import { useMyAccess } from "@/hooks/use-my-access";
import { uploadOrgLogo, LOGO_LIMIT } from "@/lib/org-branding";
import { updateOrganization } from "@/lib/organization.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Same swatches the /start builder offers, so nothing looks different later. */
export const BRAND_SWATCHES = ["#CBA35A", "#2F5DA8", "#2E8B57", "#C0392B", "#7B3FA0", "#2B2925"];
const HEX = /^#[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9-]{3,40}$/;

type Form = { name: string; tagline: string; accent_color: string; slug: string };

/** Agency name, logo, color and portal link — saved automatically, previewed live. */
export function IdentityHub() {
  const { org } = useOrganization();
  const { access } = useMyAccess();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOrganization);
  const canEditSlug = Boolean(access?.isOwner);

  const [form, setForm] = useState<Form | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const lastSaved = useRef<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!org || form) return;
    const f = { name: org.name ?? "", tagline: org.tagline ?? "", accent_color: HEX.test(org.accent_color ?? "") ? org.accent_color! : BRAND_SWATCHES[0], slug: org.slug ?? "" };
    lastSaved.current = JSON.stringify(f);
    setForm(f);
    setLogo(org.logo_url ?? null);
  }, [org, form]);

  // Autosave, debounced. Only valid values are sent.
  useEffect(() => {
    if (!form) return;
    const key = JSON.stringify(form);
    if (key === lastSaved.current) return;
    if (!form.name.trim() || !HEX.test(form.accent_color)) return;
    const t = setTimeout(async () => {
      setStatus("saving");
      try {
        await updateFn({ data: {
          name: form.name.trim(), tagline: form.tagline, accent_color: form.accent_color,
          ...(canEditSlug && SLUG.test(form.slug) ? { slug: form.slug } : {}),
        } });
        lastSaved.current = key;
        qc.invalidateQueries({ queryKey: ["organization"] });
        setStatus("saved");
      } catch (e: any) {
        setStatus("idle");
        toast.error(e?.message ?? "Couldn't save");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [form, canEditSlug, updateFn, qc]);

  async function onFile(file: File | undefined) {
    if (!file || !org?.id) return;
    setUploading(true);
    try {
      const { url } = await uploadOrgLogo(org.id, file);
      await updateFn({ data: { logo_url: url } });
      setLogo(url);
      qc.invalidateQueries({ queryKey: ["organization"] });
      setStatus("saved");
    } catch (e: any) {
      toast.error(e?.message ?? "The logo could not be uploaded");
    } finally {
      setUploading(false);
    }
  }

  if (!form) return <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />;
  const set = (p: Partial<Form>) => { setStatus("idle"); setForm({ ...form, ...p }); };
  const color = HEX.test(form.accent_color) ? form.accent_color : BRAND_SWATCHES[0];
  const initials = form.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "AC";
  const mark = logo
    ? <img src={logo} alt="" className="h-full w-full object-contain" />
    : <span className="text-xs font-bold" style={{ color }}>{initials}</span>;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Your agency</h2>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {status === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Saving</>}
            {status === "saved" && <><Check className="h-3 w-3 text-success" /> Saved</>}
          </span>
        </div>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
          className={cn(
            "flex w-full items-center gap-4 rounded-xl border border-dashed p-4 text-left transition-colors",
            drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          )}
        >
          <div className="flex gap-2">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl border border-border bg-background p-1.5">{mark}</div>
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-ink p-1.5">{mark}</div>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4 text-primary" />}
              {logo ? "Replace logo" : "Add your logo"}
            </p>
            <p className="text-xs text-muted-foreground">Drop a file or click. Square PNG or SVG, up to {LOGO_LIMIT.label}.</p>
          </div>
          <input ref={fileRef} type="file" accept={LOGO_LIMIT.accept} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </button>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="id-name">Agency name</Label>
            <Input id="id-name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="id-tag">Tagline <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input id="id-tag" value={form.tagline} maxLength={60} onChange={(e) => set({ tagline: e.target.value })} placeholder="Building generational wealth" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Brand color</Label>
          <div className="flex flex-wrap items-center gap-2.5">
            {BRAND_SWATCHES.map((c) => (
              <button
                key={c} type="button" aria-label={`Use ${c}`} onClick={() => set({ accent_color: c })}
                className={cn("grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-card transition", form.accent_color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-foreground" : "hover:scale-105")}
                style={{ backgroundColor: c }}
              >
                {form.accent_color.toLowerCase() === c.toLowerCase() && <Check className="h-4 w-4 text-primary-foreground" />}
              </button>
            ))}
            <label className="relative grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-dashed border-border hover:border-primary" aria-label="Custom color">
              <Pipette className="h-4 w-4 text-muted-foreground" />
              <input type="color" value={color} onChange={(e) => set({ accent_color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="id-slug">Portal link</Label>
          <div className="flex items-center rounded-md border border-input bg-background pl-3 text-sm focus-within:ring-1 focus-within:ring-ring">
            <span className="text-muted-foreground">app.useagentcloud.com/join/</span>
            <input id="id-slug" disabled={!canEditSlug} value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} className="h-9 min-w-0 flex-1 bg-transparent px-1 outline-none disabled:opacity-60" />
          </div>
          {canEditSlug && form.slug && !SLUG.test(form.slug) && <p className="text-xs text-destructive">3–40 letters, numbers or dashes.</p>}
        </div>
      </div>

      <IdentityPreview name={form.name || "Your agency"} tagline={form.tagline} color={color} mark={mark} />
    </div>
  );
}

function IdentityPreview({ name, tagline, color, mark }: { name: string; tagline: string; color: string; mark: React.ReactNode }) {
  return (
    <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live preview</p>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2.5 border-b border-border p-3">
          <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg border border-border p-1">{mark}</div>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{name}</p>{tagline && <p className="truncate text-[11px] text-muted-foreground">{tagline}</p>}</div>
        </div>
        <div className="space-y-1 p-2 text-xs">
          <div className="rounded-md px-2 py-1.5 font-medium" style={{ backgroundColor: `${color}22`, color }}>Dashboard</div>
          <div className="px-2 py-1.5 text-muted-foreground">Pipeline</div>
          <div className="px-2 py-1.5 text-muted-foreground">Book of Business</div>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="h-1.5" style={{ backgroundColor: color }} />
        <div className="space-y-2 p-4 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-border p-1">{mark}</div>
          <p className="text-sm font-semibold">You're invited to join {name}</p>
          <span className="inline-block rounded-full px-4 py-1.5 text-xs font-medium text-primary-foreground" style={{ backgroundColor: color }}>Accept invite</span>
        </div>
      </div>
    </div>
  );
}
