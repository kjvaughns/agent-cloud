import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources/training")({
  component: TrainingPage,
});

const TRACKS = [
  { title: "New Agent Fast Start", lessons: 12, duration: "4h 20m", progress: 75, level: "Beginner" },
  { title: "IUL Mastery", lessons: 18, duration: "7h 10m", progress: 40, level: "Intermediate" },
  { title: "Annuity Specialist", lessons: 22, duration: "9h 30m", progress: 0, level: "Advanced" },
  { title: "Recruiting Playbook", lessons: 14, duration: "5h 45m", progress: 100, level: "Leadership" },
  { title: "Telesales Conversion", lessons: 10, duration: "3h 30m", progress: 60, level: "Intermediate" },
  { title: "Compliance & Ethics 2026", lessons: 8, duration: "2h 15m", progress: 25, level: "Required" },
];

function TrainingPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {TRACKS.map((t) => (
        <Card key={t.title} className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">{t.title}</CardTitle>
              <Badge variant={t.level === "Required" ? "destructive" : "secondary"}>{t.level}</Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Play className="h-3 w-3" />{t.lessons} lessons</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.duration}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={t.progress} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t.progress}% complete</span>
              <span>{t.progress === 100 ? "Done" : t.progress === 0 ? "Not started" : "In progress"}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
