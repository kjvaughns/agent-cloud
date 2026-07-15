## Removals
- Delete `src/routes/_authenticated/tools/needs-analysis.tsx`
- Delete `src/routes/_authenticated/tools/inbound-calls.tsx`
- Remove the "Needs Analysis" and "Inbound Calls" entries from the Tools group in `src/components/app-sidebar.tsx`.
- Sweep for any lingering `<Link to="/tools/needs-analysis">` / `/tools/inbound-calls` references (grep) and remove them.

## Quoter → external link
- In `src/components/app-sidebar.tsx`, replace the current "Toolkits" Tools entry with **"Quoter"** that opens `https://app.insurancetoolkits.com/fex/quoter` in a new tab.
- The sidebar's `renderItem` uses `<Link to>` for internal routes only. Introduce a small variant: if a nav item has `external: true` and an `href`, render an `<a href target="_blank" rel="noopener noreferrer">` inside `SidebarMenuButton asChild` instead of `<Link>`.
- Leave `src/routes/_authenticated/tools/quoter.tsx` in place (doesn't hurt) — the sidebar simply no longer links to it. If preferred, delete it too; I'll delete unless you say otherwise.

## AI Assistant → Nova AI (rename + modernize)
Keep the route path `/ai-assistant` (avoids breaking bookmarks and cross-links). Rename all visible copy and modernize the layout.

Rename:
- Sidebar label "AI Assistant" → **"Nova AI"** (keep Sparkles icon, gold accent).
- Page hero title → **"Nova AI"**, subtitle → "Your sales co-pilot for objections, scripts, and pipeline strategy."
- Chat panel header "Chat" → "Nova". Bot icon stays.
- Initial assistant greeting: "Hi, I'm Nova — your AI co-pilot. I draft, summarize, coach objections, and build scripts. What do you need?"
- Input placeholder → "Ask Nova anything…"

Modernize the layout to match the app's current gold/dark surface style:
1. **Hero band**: replace the plain `HeroBand` with a gold-accented header row — sparkles glyph in a rounded gold tile, "Nova AI" in the display font, one-line subtitle, and a small "Beta" chip.
2. **Full-height chat**: promote the chat to a single hero surface `min-h-[70vh]` with rounded-2xl border, subtle inner gradient, and a sticky composer at the bottom. Remove the 3-column split.
3. **Quick prompts as chips above the composer** (not a side panel): show the 4 `PROMPTS` as horizontally-scrolling gold-outline pills; clicking sends the prompt. Merge with existing `SUGGESTIONS` into one row of ~6 chips.
4. **Message bubbles**: user bubbles keep gold primary; assistant bubbles get a soft surface with a small "Nova" label and timestamp on hover. Add markdown rendering (simple: preserve current whitespace, add `prose prose-invert` styling).
5. **Composer**: single rounded pill with mic + input + send. Send button in gold. Add subtle shadow.
6. **Secondary tabs (Memory / Voice / Integrations / Automations / Activity)** move into a collapsible "Nova settings" section BELOW the chat, opened via a small "Settings" gear button in the chat header — collapsed by default so first paint is chat-focused.

## Files touched
- `src/routes/_authenticated/ai-assistant.tsx` — rewrite for the new layout and Nova copy.
- `src/components/app-sidebar.tsx` — rename entry, external Quoter link, drop 2 removed items, support external nav item type.
- Delete: `src/routes/_authenticated/tools/needs-analysis.tsx`, `src/routes/_authenticated/tools/inbound-calls.tsx` (and `tools/quoter.tsx` if you approve).
- Grep-based cleanup of any stray links to the deleted routes.

## Non-goals
- No changes to server-side `askAiAssistant` logic — it already returns Nova-branded replies.
- No route path rename; only display copy changes to "Nova AI".
