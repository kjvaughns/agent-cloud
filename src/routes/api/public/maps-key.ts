import { createFileRoute } from "@tanstack/react-router";

// Serves the referrer-restricted Google Maps browser key to the client.
// Safe to expose: the key is protected by Google's HTTP-referrer allowlist.
export const Route = createFileRoute("/api/public/maps-key")({
  server: {
    handlers: {
      GET: async () => {
        const key =
          process.env["GOOGLE_MAPS_API_AC"] ||
          process.env["GOOGLE_MAPS_BROWSER_KEY"] ||
          "";
        const channel = process.env["GOOGLE_MAPS_TRACKING_ID"] || "";
        if (!key) {
          return Response.json(
            { key: null, error: "GOOGLE_MAPS_API_AC is not configured" },
            { status: 200, headers: { "cache-control": "no-store" } },
          );
        }
        return Response.json(
          { key, channel: channel || null },
          { headers: { "cache-control": "public, max-age=300" } },
        );
      },
    },
  },
});
