import { useState } from "react";
import { useServerFn } from "@/hooks/use-server-fn";
import { getProspectNurture, type NurtureSequence } from "@/lib/ai-features.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Copy, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export function NurtureDialog({
  prospectId,
  prospectName,
  open,
  onOpenChange,
}: {
  prospectId: string;
  prospectName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const fn = useServerFn(getProspectNurture);
  const [loading, setLoading] = useState(false);
  const [seq, setSeq] = useState<NurtureSequence | null>(null);

  async function generate() {
    setLoading(true);
    setSeq(null);
    try {
      const res = await fn({ data: { prospect_id: prospectId } });
      setSeq(res);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate sequence");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Nurture Sequence — {prospectName}
          </DialogTitle>
        </DialogHeader>

        {!seq && !loading && (
          <div className="py-8 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a personalized 5-touch outreach plan based on this prospect's stage and history.
            </p>
            <Button onClick={generate}>
              <Sparkles className="h-4 w-4 mr-2" /> Generate Sequence
            </Button>
          </div>
        )}

        {loading && (
          <div className="py-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Drafting sequence…
          </div>
        )}

        {seq && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <span className="font-medium">Angle:</span> {seq.summary}
            </div>
            {seq.messages.map((m, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Day {m.day}</Badge>
                    <Badge variant="secondary" className="capitalize">
                      {m.channel === "email" ? <Mail className="h-3 w-3 mr-1" /> : <MessageSquare className="h-3 w-3 mr-1" />}
                      {m.channel}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        (m.subject ? `Subject: ${m.subject}\n\n` : "") + m.body,
                      );
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                {m.subject && <div className="text-sm font-medium">{m.subject}</div>}
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                <p className="text-xs text-muted-foreground italic">Goal: {m.goal}</p>
              </div>
            ))}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
                <Sparkles className="h-3 w-3 mr-2" /> Regenerate
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
