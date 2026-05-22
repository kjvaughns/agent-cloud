import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { MOCK_CLIENTS, STAGE_META, type PipelineStage, type MockClient } from "@/lib/mock-data";
import { TemperatureBadge } from "@/components/temperature-badge";
import { ClientDetailDrawer } from "@/components/client-detail-drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fmtPhone } from "@/lib/format";
import { Search, Plus, Phone, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({ meta: [
    { title: "Pipeline — Agent Cloud" },
    { name: "description", content: "Drag-and-drop sales pipeline for your leads." },
  ]}),
  component: PipelinePage,
});

const STAGES: PipelineStage[] = ["new_lead","contacted","appointment_set","presentation","application","issued","lost"];

function PipelinePage() {
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState(MOCK_CLIENTS);
  const [selected, setSelected] = useState<MockClient | null>(null);
  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const q = query.toLowerCase();
    const out: Record<PipelineStage, MockClient[]> = {
      new_lead: [], contacted: [], appointment_set: [], presentation: [],
      application: [], issued: [], lost: [],
    };
    for (const c of clients) {
      if (q && !`${c.first_name} ${c.last_name} ${c.city} ${c.phone}`.toLowerCase().includes(q)) continue;
      out[c.stage].push(c);
    }
    return out;
  }, [clients, query]);

  const onDrop = (stage: PipelineStage) => {
    if (!dragId) return;
    setClients((prev) => prev.map((c) => c.id === dragId ? { ...c, stage } : c));
    setDragId(null);
  };

  const openClient = (c: MockClient) => { setSelected(c); setOpen(true); };

  return (
    <div className="p-6 space-y-4 h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Drag leads between stages. Click a card to see details.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads..." className="pl-8 w-64" />
          </div>
          <Button><Plus className="h-4 w-4" /> Add Lead</Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-x-auto">
        <div className="flex gap-3 h-full min-w-max pb-2">
          {STAGES.map((stage) => {
            const meta = STAGE_META[stage];
            const cards = grouped[stage];
            return (
              <div
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(stage)}
                className="w-72 shrink-0 flex flex-col bg-muted/40 rounded-xl"
              >
                <div className="flex items-center justify-between px-3 py-2.5 border-b">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", meta.color)} />
                    <span className="font-semibold text-sm">{meta.label}</span>
                    <span className="text-xs text-muted-foreground">{cards.length}</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragId(c.id)}
                      onClick={() => openClient(c)}
                      className="bg-card border rounded-lg p-3 cursor-pointer hover:border-primary/50 hover:shadow-sm transition"
                    >
                      <div className="flex items-start gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">{c.first_name[0]}{c.last_name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{c.first_name} {c.last_name}</div>
                          <div className="text-xs text-muted-foreground truncate">{c.city}, {c.state}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <TemperatureBadge value={c.temperature} />
                        <span className="text-xs text-muted-foreground">{c.source}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{fmtPhone(c.phone)}</span>
                        {c.next_followup && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(c.next_followup).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">Drop leads here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ClientDetailDrawer client={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
