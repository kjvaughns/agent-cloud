import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { adminListAllAgents, adminMoveAgent } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/hierarchy")({
  component: AdminHierarchy,
  head: () => ({ meta: [{ title: "Hierarchy — Agent Cloud Admin" }] }),
});

type AgentNode = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  upline_id: string | null;
  children: AgentNode[];
};

function buildFullTree(agents: any[]): AgentNode[] {
  const byUpline = new Map<string, any[]>();
  for (const a of agents) {
    const k = a.upline_id ?? "__root__";
    if (!byUpline.has(k)) byUpline.set(k, []);
    byUpline.get(k)!.push(a);
  }
  const build = (key: string): AgentNode[] =>
    (byUpline.get(key) ?? []).map((a) => ({
      ...a,
      children: build(a.id),
    }));
  return build("__root__");
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function OrgNode({ node, collapsed, toggle }: { node: AgentNode; collapsed: Set<string>; toggle: (id: string) => void }) {
  const isCollapsed = collapsed.has(node.id);
  const borderColor = node.status === "active" ? "border-l-green-500" : node.status === "pending" ? "border-l-amber-500" : "border-l-muted-foreground";

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={() => toggle(node.id)}
        className={`border border-l-4 ${borderColor} rounded-lg bg-card px-3 py-2 min-w-[130px] hover:shadow-md transition-shadow text-left`}
      >
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-xs">{initials(node.first_name, node.last_name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xs font-medium leading-tight">{node.first_name} {node.last_name}</p>
            {node.children.length > 0 && (
              <p className="text-[10px] text-muted-foreground">{node.children.length} direct</p>
            )}
          </div>
        </div>
      </button>

      {!isCollapsed && node.children.length > 0 && (
        <div className="flex gap-4 items-start">
          {node.children.map((child) => (
            <OrgNode key={child.id} node={child} collapsed={collapsed} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdminHierarchy() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    adminListAllAgents().then((res) => {
      setAgents(res.agents);
      if (res.agents.length > 50) {
        setCollapsed(new Set(res.agents.map((a: any) => a.id).slice(10)));
      }
      setLoading(false);
    });
  }, []);

  const tree = useMemo(() => buildFullTree(agents), [agents]);

  const toggle = (id: string) => setCollapsed((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Agency Hierarchy</h1>
        <p className="text-sm text-muted-foreground mt-1">Full org chart of all agents. Click any node to expand/collapse.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Organization Chart</CardTitle>
              <p className="text-xs text-muted-foreground">{agents.length} agents total</p>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="outline" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}><ZoomIn className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}><ZoomOut className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="border rounded-lg bg-muted/30 overflow-hidden h-[600px] relative cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => setDragging({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
              onPointerMove={(e) => dragging && setPan({ x: e.clientX - dragging.x, y: e.clientY - dragging.y })}
              onPointerUp={() => setDragging(null)}
              onPointerLeave={() => setDragging(null)}
            >
              <div
                className="absolute inset-0 flex items-start justify-center pt-8"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "top center" }}
              >
                <TooltipProvider>
                  <div className="flex flex-col items-center gap-6">
                    {tree.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No agents in the hierarchy yet</p>
                    ) : (
                      <div className="flex gap-6 items-start">
                        {tree.map((n) => <OrgNode key={n.id} node={n} collapsed={collapsed} toggle={toggle} />)}
                      </div>
                    )}
                  </div>
                </TooltipProvider>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
