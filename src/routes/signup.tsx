import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { AuthShell } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up — Agent Cloud" }] }),
  component: SignupPage,
});

function SignupPage() {
  return (
    <AuthShell title="Invitation Required" subtitle="Agent Cloud accounts are by invitation only">
      <div className="flex flex-col items-center text-center space-y-4 py-4">
        <div className="h-16 w-16 rounded-full bg-muted grid place-items-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          Ask your upline to send you an invite link. Invite links include your assigned carriers and commission levels so you start in the right place in the hierarchy.
        </p>
        <Link to="/login" className="text-sm text-primary font-medium hover:underline">
          Already have an account? Sign in →
        </Link>
      </div>
    </AuthShell>
  );
}
