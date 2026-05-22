import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Pencil, Target, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tools/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Agent Cloud" },
      { name: "description", content: "Manage your lead sources and purchases." },
    ],
  }),
  component: LeadsPage,
});

const STATES = ["TX", "FL", "GA", "NC", "OH", "PA", "TN", "AZ"];

const MARKETPLACE = [
  { vendor: "Premium Leads Co", product: "Final Expense TV Leads", delivery: "Real-Time", price: 28, min: 15, category: "Final Expense" },
  { vendor: "Senior Market Leads", product: "Premium Annuity Leads", delivery: "Real-Time", price: 65, min: 5, category: "Annuity" },
  { vendor: "National Lead Source", product: "Nationwide Life Insurance Leads", delivery: "same-day", price: 22.5, min: 20, category: "Life Insurance" },
  { vendor: "Premium Leads Co", product: "Exclusive Medicare Leads", delivery: "Real-Time", price: 35, min: 10, category: "Medicare" },
  { vendor: "National Lead Source", product: "Health Insurance Open Enrollment", delivery: "same-day", price: 18, min: 25, category: "Health" },
  { vendor: "Senior Market Leads", product: "Medicare Supplement Mailers", delivery: "batch", price: 12, min: 50, category: "Medicare" },
];

const ORDERS = [
  { date: "May 18, 2026", vendor: "Premium Leads Co", product: "Final Expense TV Leads", qty: 25, price: 28, total: 700, delivery: "Real-Time", status: "Delivered" },
  { date: "May 10, 2026", vendor: "Senior Market Leads", product: "Premium Annuity Leads", qty: 10, price: 65, total: 650, delivery: "Real-Time", status: "Delivered" },
  { date: "May 2, 2026", vendor: "National Lead Source", product: "Nationwide Life Leads", qty: 50, price: 22.5, total: 1125, delivery: "same-day", status: "Pending" },
];

function LeadsPage() {
  const [tab, setTab] = useState("states");
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Target className="h-7 w-7" /> Leads</h1>
        <p className="text-muted-foreground mt-1">Manage your lead sources and purchases.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="states">States</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          <TabsTrigger value="dialer">Dialer</TabsTrigger>
          <TabsTrigger value="orders">My Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="states" className="mt-4">
          <Card><CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">States for Leads</h3>
                <p className="text-sm text-muted-foreground">Your selected states for receiving leads</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{STATES.length} selected</Badge>
                <Button variant="outline" size="sm"><Pencil className="h-3 w-3 mr-1" /> Edit</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {STATES.map((s) => <Badge key={s} className="text-sm">{s}</Badge>)}
            </div>
            <Button className="w-full bg-success hover:bg-success/90" onClick={() => setTab("marketplace")}>Continue to Marketplace</Button>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="marketplace" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {["All Products", "Final Expense", "Mortgage Protection", "IUL", "Annuity", "Life Insurance", "Medicare"].map((p, i) => (
              <Button key={p} variant={i === 0 ? "default" : "outline"} size="sm">{p}</Button>
            ))}
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MARKETPLACE.map((l, i) => (
              <Card key={i}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{l.vendor}</Badge>
                    <Badge variant="secondary" className="text-xs">{l.category}</Badge>
                  </div>
                  <h3 className="font-semibold">{l.product}</h3>
                  <Badge className="text-xs">{l.delivery}</Badge>
                  <div className="flex items-end justify-between pt-2 border-t">
                    <div>
                      <div className="text-xs text-muted-foreground">PER LEAD</div>
                      <div className="text-2xl font-bold">${l.price.toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Min. Order</div>
                      <div className="font-medium">{l.min} leads</div>
                    </div>
                  </div>
                  <Button size="sm" className="w-full">View Details</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="dialer" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card><CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">Premium Dialer</h3>
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500"><Zap className="h-3 w-3 mr-1" /> Premium</Badge>
              </div>
              <div className="text-3xl font-bold">$1,000<span className="text-sm font-normal text-muted-foreground">/week</span></div>
              <ul className="text-sm space-y-1.5 text-muted-foreground">
                <li>✓ Daily Lead Updates</li><li>✓ Integrated CRM + Dialer</li><li>✓ Analytics Dashboard</li>
                <li>✓ Priority Lead Access</li><li>✓ Exclusive Lead Pool</li><li>✓ Priority Support</li>
              </ul>
              <Button className="w-full">Subscribe</Button>
            </CardContent></Card>
            <Card><CardContent className="p-6 space-y-4">
              <h3 className="font-bold text-lg">Weekly Dialer</h3>
              <div className="text-3xl font-bold">$250<span className="text-sm font-normal text-muted-foreground">/week</span></div>
              <ul className="text-sm space-y-1.5 text-muted-foreground">
                <li>✓ Integrated CRM + Dialer</li><li>✓ Analytics Dashboard</li><li>✓ Call Recordings</li>
                <li>✓ Instant Connect</li><li>✓ One-Minute Call Pacing</li><li>✓ Simple Setup</li>
              </ul>
              <Button variant="outline" className="w-full">Subscribe</Button>
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead>Product</TableHead>
                <TableHead>Qty</TableHead><TableHead>Price</TableHead><TableHead>Total</TableHead>
                <TableHead>Delivery</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ORDERS.map((o, i) => (
                  <TableRow key={i}>
                    <TableCell>{o.date}</TableCell><TableCell>{o.vendor}</TableCell><TableCell>{o.product}</TableCell>
                    <TableCell>{o.qty}</TableCell><TableCell>${o.price}</TableCell>
                    <TableCell className="font-medium">${o.total}</TableCell>
                    <TableCell><Badge variant="outline">{o.delivery}</Badge></TableCell>
                    <TableCell><Badge className={o.status === "Delivered" ? "bg-success/15 text-success" : "bg-amber-500/15 text-amber-600"}>{o.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
