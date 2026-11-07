import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { getSetupState } from "@/lib/self-serve.functions";
import { shouldRedirectToSetup } from "@/lib/onboarding/setup";
import { useAccessState } from "@/components/read-only-gate";

/** Sends owners with unfinished setup to the wizard. */
export function SetupRedirect() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const getState = useServerFn(getSetupState);
  const { data } = useQuery({ queryKey: ["setup-state"], queryFn: () => getState(), staleTime: 60_000 });
  useEffect(() => {
    if (data && shouldRedirectToSetup(data.needsSetup, pathname)) navigate({ to: "/setup" });
  }, [data, pathname, navigate]);
  return null;
}

/** Owners who built a workspace but never paid go back to the launch/checkout screen. */
export function PaywallRedirect() {
  const { data } = useAccessState();
  useEffect(() => {
    const d = data as any;
    if (d && d.mode === "read_only" && d.reason === "no_plan" && d.isOwner && d.neverPaid) window.location.assign("/start");
  }, [data]);
  return null;
}
