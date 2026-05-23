import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contracting")({
  component: ContractingLayout,
});

function ContractingLayout() {
  return (
    <div className="flex flex-col">
      <Outlet />
    </div>
  );
}
