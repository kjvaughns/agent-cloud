import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/back-office/recruiting-tracker")({
  beforeLoad: () => {
    throw redirect({ to: "/back-office/marketing-tracker" });
  },
  component: () => null,
});
