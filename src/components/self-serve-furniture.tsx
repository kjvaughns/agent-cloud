import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { getSetupState } from "@/lib/self-serve.functions";
import { shouldRedirectToSetup } from "@/lib/onboarding/setup";

/** Sends owners with unfinished setup to the wizard. */
export function SetupRedirect() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const getState = useServerFn(getSetupState);
  const { data } = useQuery({ queryKey: ["setup-state"], queryFn: () => getState(), staleTime: 60_000 });
  useEffect(() => {
    if (data && shouldRedirectToSetup(data.needsSetup, pathname)) navigate({ to: "/settings/agency" });
  }, [data, pathname, navigate]);
  return null;
}
