/**
 * Server functions for the agent-grouped contracting workspace.
 *
 * Thin wrappers only. Every line of logic lives in
 * `contracting-agents.server.ts` — a `createServerFn` module's top level ships
 * to the client bundle, so the server-only import happens inside the handler.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AgentListFilter, AgentListSort } from "@/lib/contracting-agents.server";

type Ctx = { userId: string };

export type AgentListInput = {
  search?: string;
  filter?: AgentListFilter;
  sort?: AgentListSort;
  page?: number;
  pageSize?: number;
};

export const listContractingAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AgentListInput | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { listAgentSummaries } = await import("@/lib/contracting-agents.server");
    return listAgentSummaries({ ...data, userId: (context as unknown as Ctx).userId });
  });

export const getContractingAgentWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string }) => ({ agentId: String(input.agentId) }))
  .handler(async ({ data, context }) => {
    const { getAgentWorkspace } = await import("@/lib/contracting-agents.server");
    return getAgentWorkspace({ agentId: data.agentId, userId: (context as unknown as Ctx).userId });
  });
