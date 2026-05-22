import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources/agent-academy")({
  head: () => ({
    meta: [
      { title: "Agent Academy — Agent Cloud" },
      { name: "description", content: "Self-paced courses on sales, products, and recruiting. Earn certifications." },
    ],
  }),
  component: AcademyPage,
});

const COURSES = [
  { title: "IUL Mastery", level: "Intermediate", duration: "3h 20m", progress: 65, lessons: 12 },
  { title: "Final Expense Telesales", level: "Beginner", duration: "1h 45m", progress: 100, lessons: 8 },
  { title: "Annuity Foundations", level: "Beginner", duration: "2h 10m", progress: 30, lessons: 10 },
  { title: "Objection Handling Bootcamp", level: "All levels", duration: "1h 15m", progress: 0, lessons: 6 },
  { title: "Recruiting Top Producers", level: "Advanced", duration: "4h", progress: 12, lessons: 16 },
  { title: "Compliance & Suitability", level: "Required", duration: "55m", progress: 100, lessons: 4 },
];

function AcademyPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {COURSES.map((c) => (
          <Card key={c.title} className="hover:shadow-md transition-shadow">
            <div className="h-24 bg-gradient-to-br from-primary/20 via-info/20 to-success/20 rounded-t-xl grid place-items-center">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{c.title}</CardTitle>
                {c.progress === 100 && <Badge variant="secondary" className="bg-success/15 text-success">Certified</Badge>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <Badge variant="outline">{c.level}</Badge>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {c.duration}</span>
                <span>{c.lessons} lessons</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={c.progress} />
              <Button size="sm" variant={c.progress === 0 ? "default" : "outline"} className="w-full">
                {c.progress === 0 ? "Start" : c.progress === 100 ? "Review" : "Resume"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
