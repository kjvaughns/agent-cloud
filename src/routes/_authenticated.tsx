import { createFileRoute, Outlet, redirect, useRouter, isRedirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { CommandPalette } from "@/components/command-palette";
import { supabase } from "@/integrations/supabase/client";

function AuthErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  if (isRedirect(error)) throw error;
  console.error(error);
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-6">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn't load this section. Try again or return to the dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Home className="mr-2 h-4 w-4" />
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  // Session lives in localStorage; SSR has nothing useful to render for
  // authenticated pages, so skip it entirely and ship the client shell faster.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AuthenticatedLayout,
  errorComponent: AuthErrorComponent,
});

function AuthenticatedLayout() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(localStorage.getItem("sidebar-open") !== "false");
  }, []);

  function persistSidebarOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    localStorage.setItem("sidebar-open", String(nextOpen));
  }

  return (
    <SidebarProvider open={open} onOpenChange={persistSidebarOpen}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 min-w-1 content-container"><Outlet /></main>
        </div>
      </div>
      <CommandPalette />
    </SidebarProvider>
  );
}
