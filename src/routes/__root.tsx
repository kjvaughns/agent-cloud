import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  isRedirect,
} from "@tanstack/react-router";
import { Cloud, AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-6">
          <Cloud className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Home className="mr-2 h-4 w-4" />
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  if (isRedirect(error)) throw error;
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-6">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
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
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Home className="mr-2 h-4 w-4" />
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Agent Cloud" },
      { name: "description", content: "Life insurance agency management platform — pipeline, contracting, calls, SMS, analytics, and a downline command center." },
      { name: "author", content: "Agent Cloud" },
      { property: "og:title", content: "Agent Cloud" },
      { property: "og:description", content: "Life insurance agency management platform — pipeline, contracting, calls, SMS, analytics, and a downline command center." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@AgentCloud" },
      { name: "twitter:title", content: "Agent Cloud" },
      { name: "twitter:description", content: "Life insurance agency management platform — pipeline, contracting, calls, SMS, analytics, and a downline command center." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/v3puJ4myToWqyJr4IR5tpkpkKyR2/social-images/social-1780577617299-5100D1E7-2E55-4D65-BBF9-55FB59592A9B.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/v3puJ4myToWqyJr4IR5tpkpkKyR2/social-images/social-1780577617299-5100D1E7-2E55-4D65-BBF9-55FB59592A9B.webp" },
    ],
    links: [
      { rel: "icon", type: "image/jpeg", href: "/favicon.jpg" },
      { rel: "apple-touch-icon", href: "/favicon.jpg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== "SIGNED_IN" || !session?.user) return;

      // Auto-upgrade imported placeholder to active on first real sign-in
      try {
        const { data: profile } = await supabase
          .from("profiles").select("status").eq("id", session.user.id).maybeSingle();
        if ((profile as any)?.status === "imported") {
          await supabase.from("profiles").update({ status: "active" }).eq("id", session.user.id);
        }
      } catch {}

      const provider = (session.user.app_metadata as any)?.provider;
      if (provider === "google") {
        try {
          await supabase.from("profiles").update({ google_oauth_connected: true }).eq("id", session.user.id);
        } catch (e) {
          console.error("Failed to mark google_oauth_connected", e);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
