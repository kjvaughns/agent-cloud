import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (session) {
          navigate({ to: "/dashboard", replace: true });
        } else {
          navigate({ to: "/login", replace: true });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}
