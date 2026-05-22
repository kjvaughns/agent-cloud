import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Heart, MessageCircle, Share2, Trophy, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/news-feed")({
  component: NewsFeedPage,
});

const POSTS = [
  { id: 1, author: "Marcus Chen", role: "Director", initials: "MC", time: "20m", type: "win", body: "Just placed a $48K AP IUL on a 42yo physician. Sophai's objection script for cost concerns was money. 🔥", likes: 34, comments: 8 },
  { id: 2, author: "Priya Singh", role: "Manager", initials: "PS", time: "1h", type: "milestone", body: "Hit $250K AP for the month! Team Apex is stacking wins. Recruiting 3 more agents this week — DM if interested.", likes: 87, comments: 21 },
  { id: 3, author: "James O'Connor", role: "Agent", initials: "JO", time: "3h", type: "question", body: "Anyone have a great script for objection: 'I need to talk to my spouse'? Lost two deals this week on that.", likes: 12, comments: 19 },
  { id: 4, author: "Sara Lopez", role: "Director", initials: "SL", time: "6h", type: "tip", body: "PRO TIP: always lead with the term-vs-permanent comparison. Visual sells. Sophai now generates that chart automatically.", likes: 56, comments: 14 },
];

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  win: { label: "Win", icon: Trophy, color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  milestone: { label: "Milestone", icon: TrendingUp, color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  question: { label: "Question", icon: MessageCircle, color: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  tip: { label: "Tip", icon: Trophy, color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
};

function NewsFeedPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">News Feed</h1>
        <p className="text-muted-foreground mt-1">What your agency is talking about.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex gap-3">
            <Avatar><AvatarFallback>YO</AvatarFallback></Avatar>
            <Textarea placeholder="Share a win, ask for help, drop a tip..." className="resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm">Add Photo</Button>
            <Button size="sm">Post</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {POSTS.map((p) => {
          const meta = TYPE_META[p.type];
          const Icon = meta.icon;
          return (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar><AvatarFallback>{p.initials}</AvatarFallback></Avatar>
                    <div>
                      <div className="font-medium text-sm">{p.author}</div>
                      <div className="text-xs text-muted-foreground">{p.role} · {p.time}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className={meta.color}><Icon className="h-3 w-3 mr-1" />{meta.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{p.body}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground border-t pt-3">
                  <button className="flex items-center gap-1 hover:text-foreground"><Heart className="h-4 w-4" />{p.likes}</button>
                  <button className="flex items-center gap-1 hover:text-foreground"><MessageCircle className="h-4 w-4" />{p.comments}</button>
                  <button className="flex items-center gap-1 hover:text-foreground"><Share2 className="h-4 w-4" />Share</button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
