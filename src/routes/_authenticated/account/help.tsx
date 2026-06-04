import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LifeBuoy, Mail, MessageSquare, Phone, Search } from "lucide-react";
import { toast } from "sonner";
import { submitSupportTicket } from "@/lib/help.functions";

export const Route = createFileRoute("/_authenticated/account/help")({
  head: () => ({
    meta: [
      { title: "Help Center — Agent Cloud" },
      { name: "description", content: "Get help with Agent Cloud — articles, contact support, and live chat." },
    ],
  }),
  component: HelpPage,
});

const TOPICS = [
  { title: "Getting Started", desc: "Set up your account and complete onboarding", count: 8 },
  { title: "Pipeline & CRM", desc: "Managing leads, stages, and the client drawer", count: 12 },
  { title: "Posting Deals", desc: "Submit policies and track commissions", count: 6 },
  { title: "Contracting", desc: "Carrier requests, transfers, commission grids", count: 10 },
  { title: "Phone & SMS", desc: "Twilio setup, wallet, and dial lists", count: 7 },
  { title: "AI Assistant", desc: "Chat assistant, coaching, and script building", count: 5 },
];

function ContactSupportDialog() {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const submitFn = useServerFn(submitSupportTicket);

  const mutation = useMutation({
    mutationFn: () => submitFn({ data: { subject, category: "general", description } }),
    onSuccess: () => {
      toast.success("Support ticket submitted! We'll get back to you within 1 business day.");
      setOpen(false);
      setSubject("");
      setDescription("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">Contact Support</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact Support</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Subject *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of the issue"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Message *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your issue in detail — include any error messages or steps to reproduce."
              rows={5}
              maxLength={5000}
            />
            <div className="text-xs text-muted-foreground text-right">{description.length} / 5000</div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={!subject.trim() || !description.trim() || mutation.isPending}
            >
              {mutation.isPending ? "Submitting..." : "Submit Ticket"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HelpPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><LifeBuoy className="h-7 w-7" /> Help Center</h1>
        <p className="text-muted-foreground mt-1">Search the knowledge base or get in touch with our team.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 h-11" placeholder="Search articles…" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOPICS.map((t) => (
          <Card key={t.title} className="hover:shadow-md transition cursor-pointer">
            <CardContent className="p-5">
              <div className="font-semibold">{t.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
              <div className="text-xs text-muted-foreground mt-3">{t.count} articles</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 text-center space-y-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary mx-auto"><MessageSquare className="h-5 w-5" /></div>
            <div className="font-semibold">Live Chat</div>
            <div className="text-sm text-muted-foreground">Mon–Fri, 8a–6p CT</div>
            <Button variant="outline" size="sm" className="w-full">Start Chat</Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center space-y-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary mx-auto"><Mail className="h-5 w-5" /></div>
            <div className="font-semibold">Email Support</div>
            <div className="text-sm text-muted-foreground">support@agentcloud.com</div>
            <ContactSupportDialog />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center space-y-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary mx-auto"><Phone className="h-5 w-5" /></div>
            <div className="font-semibold">Phone</div>
            <div className="text-sm text-muted-foreground">(800) 555-CLOUD</div>
            <Button variant="outline" size="sm" className="w-full">Call Support</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
