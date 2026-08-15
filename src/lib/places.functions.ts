import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseAddressComponents, type AddressParts } from "@/lib/google-maps";

/**
 * Address autocomplete runs server-side.
 *
 * The browser key is referrer-restricted to the production domain, so calling
 * Places from the browser fails on preview with API_KEY_HTTP_REFERRER_BLOCKED.
 * Proxying through the server lets us present the allowlisted referrer, so
 * autocomplete behaves the same on preview, published, and custom domains.
 */
const PLACES_REFERRER = "https://useagentcloud.com/";

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

export const placesAutocomplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ input: z.string().trim().min(3).max(200), sessionToken: z.string().max(100).optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<PlaceSuggestion[]> => {
    const key = process.env["GOOGLE_MAPS_API_AC"] || process.env["GOOGLE_MAPS_BROWSER_KEY"] || "";
    if (!key) return [];

    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        Referer: PLACES_REFERRER,
      },
      body: JSON.stringify({
        input: data.input,
        includedRegionCodes: ["us"],
        ...(data.sessionToken ? { sessionToken: data.sessionToken } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[places] autocomplete failed:", res.status, await res.text());
      return [];
    }
    const body = (await res.json()) as any;
    return ((body.suggestions ?? []) as any[])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .slice(0, 5)
      .map((p: any) => ({
        placeId: String(p.placeId ?? ""),
        primary: String(p.structuredFormat?.mainText?.text ?? p.text?.text ?? ""),
        secondary: String(p.structuredFormat?.secondaryText?.text ?? ""),
      }))
      .filter((s: PlaceSuggestion) => s.placeId && s.primary);
  });

export const placeDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ placeId: z.string().trim().min(1).max(300) }).parse(input))
  .handler(async ({ data }): Promise<AddressParts | null> => {
    const key = process.env["GOOGLE_MAPS_API_AC"] || process.env["GOOGLE_MAPS_BROWSER_KEY"] || "";
    if (!key) return null;

    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(data.placeId)}?fields=addressComponents,formattedAddress`,
      { headers: { "X-Goog-Api-Key": key, Referer: PLACES_REFERRER } },
    );
    if (!res.ok) {
      console.error("[places] details failed:", res.status, await res.text());
      return null;
    }
    const body = (await res.json()) as any;
    return parseAddressComponents((body.addressComponents ?? []) as any[]);
  });
