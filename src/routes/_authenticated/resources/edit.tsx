import { createFileRoute } from "@tanstack/react-router";
import { ResourcesPage } from "@/components/resources/resources-editor";

/**
 * Editing what your agents read.
 *
 * This was `/settings/resources`, which put the handbook editor in the same
 * drawer as billing and white label. It belongs beside the handbook — inside
 * the Resources shell, reached from a button in its header, and only by
 * people the agency has put on content duty.
 */
export const Route = createFileRoute("/_authenticated/resources/edit")({
  component: ResourcesPage,
  head: () => ({ meta: [{ title: "Edit resources | Agent Cloud" }] }),
});
