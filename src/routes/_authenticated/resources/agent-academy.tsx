import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { getCourses } from "@/lib/resources.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Play, Clock, Layers } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources/agent-academy")({
  head: () => ({ meta: [{ title: "Agent Academy — Agent Cloud" }] }),
  component: Page,
});

const CATS = ["All", "Sales Skills", "Product Knowledge", "Compliance", "Technology", "Recruiting"];

function Page() {
  const fn = useServerFn(getCourses);
  const { data: courses = [] } = useQuery({ queryKey: ["academy"], queryFn: () => fn() });
  const [cat, setCat] = useState("All");

  const featured = useMemo(() => courses.find((c: any) => c.featured), [courses]);
  const list = useMemo(() => courses.filter((c: any) => cat === "All" || c.category === cat), [courses, cat]);

  function fmtDuration(min: number) {
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><GraduationCap className="h-7 w-7" /> Agent Academy</h1>
        <p className="text-muted-foreground">Level up your skills with training modules and courses</p>
      </div>

      {featured && (
        <Card className="bg-gradient-to-br from-primary to-primary/60 text-primary-foreground border-0">
          <CardContent className="pt-6">
            <div className="text-xs uppercase opacity-80">Featured Course</div>
            <div className="text-2xl font-bold mt-1">{featured.title}</div>
            <div className="opacity-90 mt-1">{featured.description} · {featured.module_count} modules · {fmtDuration(featured.duration_minutes ?? 0)}</div>
            {((featured as any).url || (featured as any).video_url) ? (
              <Button variant="secondary" className="mt-4" onClick={() => window.open((featured as any).url || (featured as any).video_url, "_blank", "noopener,noreferrer")}>
                <Play className="h-4 w-4 mr-1" /> Start Course
              </Button>
            ) : (
              <Badge variant="secondary" className="mt-4">Coming Soon</Badge>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => (
          <Badge key={c} variant={cat === c ? "default" : "outline"} className="cursor-pointer" onClick={() => setCat(c)}>{c}</Badge>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((c: any) => (
          <Card key={c.id} className="overflow-hidden flex flex-col">
            <div className="h-28 bg-gradient-to-br from-primary/30 to-primary/5 grid place-items-center">
              <GraduationCap className="h-10 w-10 text-primary/60" />
            </div>
            <CardContent className="pt-4 flex-1 flex flex-col">
              <Badge variant="outline" className="self-start mb-2">{c.category}</Badge>
              <div className="font-semibold">{c.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.instructor_name}</div>
              <div className="text-xs text-muted-foreground mt-2 flex items-center gap-3">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtDuration(c.duration_minutes)}</span>
                <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {c.module_count} modules</span>
              </div>
              {(c.url || c.video_url) ? (
                <Button className="mt-4 self-start" size="sm" onClick={() => window.open(c.url || c.video_url, "_blank", "noopener,noreferrer")}>
                  <Play className="h-4 w-4 mr-1" /> Start Course
                </Button>
              ) : (
                <Badge variant="secondary" className="mt-4 self-start">Coming Soon</Badge>
              )}
            </CardContent>
          </Card>
        ))}
        {!list.length && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="pt-10 pb-10 text-center">
              <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <div className="font-semibold">No courses yet</div>
              <p className="text-sm text-muted-foreground mt-1">Your admin will add training courses here. Check back soon.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
