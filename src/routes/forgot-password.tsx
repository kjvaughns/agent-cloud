import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "./login";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — Agent Cloud" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
  }

  return <AuthShell title="Forgot password" subtitle="We'll email you a reset link">
    {sent ? (
      <div className="text-sm">
        <p className="text-success font-medium">Check your inbox.</p>
        <p className="text-muted-foreground mt-2">We sent a reset link to {email}.</p>
        <Link to="/login" className="text-primary hover:underline mt-4 inline-block">Back to sign in</Link>
      </div>
    ) : (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">Back to sign in</Link>
        </p>
      </form>
    )}
  </AuthShell>;
}
