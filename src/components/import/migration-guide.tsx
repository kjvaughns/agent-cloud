/**
 * "Coming from another CRM?"
 *
 * Two paths, chosen by what the source system can actually do rather than by
 * what we would prefer:
 *
 *   - It has a real export → show the click-path and name the quirks. Each
 *     quirk here costs an afternoon when it is discovered at import time
 *     instead of export time.
 *   - It does not → the Cowork path. The agency drives their own browser
 *     session; nothing is handed over.
 *
 * That second sentence is load-bearing. The version of this product that
 * shipped before asked agents for their *password* to the old system and
 * stored it base64-encoded. This is what replaces it, and the difference is
 * not a nicety — it is the whole reason the flow exists in this shape.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, ArrowRight, Check, Copy, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  MIGRATION_SOURCES, TEMPLATE_SHEETS, coworkPrompt, templateCsv,
  type MigrationSource,
} from "@/lib/migration-sources";

function downloadTemplates() {
  // One CSV per sheet rather than a real .xlsx: generating a workbook needs a
  // library on the client, and four CSVs with the exact headers answer the
  // same question — "what shape does this want" — with no dependency.
  for (const sheet of TEMPLATE_SHEETS) {
    const url = URL.createObjectURL(new Blob([templateCsv(sheet)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-cloud-${sheet.sheet.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  toast.success("Downloaded four templates, one per sheet.");
}

export function MigrationGuide() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<MigrationSource | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    if (!source) return;
    await navigator.clipboard.writeText(coworkPrompt(source));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast.success("Prompt copied. Paste it into Claude with Cowork on.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSource(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Coming from another CRM?</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {source ? `Moving from ${source.name}` : "Where are you moving from?"}
          </DialogTitle>
          <DialogDescription>
            {source
              ? source.path === "export"
                ? "This one has a real export. Here is the click-path."
                : "This one has no usable export, so Claude reads it from your own browser session."
              : "Pick your current system and we will tell you exactly what to do."}
          </DialogDescription>
        </DialogHeader>

        {!source ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {MIGRATION_SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s)}
                className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-border p-3 text-left text-sm transition hover:border-primary/60 hover:bg-surface-2"
              >
                <span className="min-w-0 truncate">{s.name}</span>
                {s.path === "cowork" && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">Cowork</Badge>
                )}
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setSource(null)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> All systems
            </button>

            {source.steps && (
              <ol className="space-y-1.5 text-sm">
                {source.steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="min-w-0">{step}</span>
                  </li>
                ))}
              </ol>
            )}

            {source.path === "cowork" && (
              <div className="space-y-2 rounded-[var(--radius)] border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Let Claude pull it out for you
                </div>
                <p className="text-xs text-muted-foreground">
                  Open Claude, turn on Cowork, and paste the prompt below. Claude reads the
                  session you are already signed into and hands you a spreadsheet formatted
                  for Agent Cloud.{" "}
                  {/* Said explicitly, because the thing this replaces did the opposite. */}
                  <strong className="text-foreground">
                    You stay signed in yourself — no password is ever shared.
                  </strong>
                </p>
                <Button size="sm" onClick={copyPrompt}>
                  {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy the prompt"}
                </Button>
              </div>
            )}

            {source.quirks && source.quirks.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium">Worth knowing</div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {source.quirks.map((q, i) => (
                    <li key={i}>• {q}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Not sure what shape the file should be? The templates carry the exact
                sheet and column names the importer reads.
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={downloadTemplates}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download the templates
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
