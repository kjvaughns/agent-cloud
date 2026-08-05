import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Scrolls rather than wraps or clips.
      //
      // A five-tab strip is about 420px, which does not fit a phone. Radix
      // renders the triggers in one row regardless, so without this the strip
      // either got cut off — hiding the last tab with no way to reach it — or
      // pushed the whole page wider than the viewport and gave every screen a
      // horizontal scrollbar. Twenty-one of the twenty-two tab strips in the
      // app had one of those two problems.
      //
      // Scrolling beats wrapping here: a wrapped strip changes height between
      // tabs and shoves the content below it up and down as you switch.
      // `max-w-full` is what actually stops the overflow — `overflow-x-auto`
      // alone does nothing on an inline-flex element that is free to grow.
      "inline-flex h-9 max-w-full items-center justify-start overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground",
      "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // shrink-0 so a trigger keeps its own width inside the scrolling strip
      // above; without it flex compresses every label to illegibility instead
      // of letting the row scroll.
      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
