import { useAuth } from "@/hooks/use-auth";
import { GetReady } from "@/components/onboarding/get-ready";

/**
 * Your own path to selling, on your own dashboard.
 *
 * A new agent's first question is "what do I do now", and until this existed
 * the answer lived across five pages they had not been told about. Disappears
 * once they are ready to sell — a checklist that stays after it is finished
 * becomes furniture.
 */
export function MyOnboarding() {
  const { user } = useAuth();
  if (!user?.id) return null;
  return <GetReady agentId={user.id} hideWhenFinished />;
}
