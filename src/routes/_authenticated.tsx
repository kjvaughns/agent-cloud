import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const [status, setStatus] = useState<"checking" | "ok" | "out">("checking");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setStatus(data.session ? "ok" : "out");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setStatus(s ? "ok" : "out");
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  if (status === "checking") {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (status === "out") {
    throw redirect({ to: "/login" });
  }

  const defaultOpen = typeof window !== "undefined"
    ? localStorage.getItem("sidebar-open") !== "false"
    : true;

  return (
    <SidebarProvider defaultOpen={defaultOpen} onOpenChange={(o) => localStorage.setItem("sidebar-open", String(o))}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 min-w-0"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}
