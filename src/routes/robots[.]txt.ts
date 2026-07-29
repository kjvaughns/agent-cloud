import { createFileRoute } from "@tanstack/react-router";

const SITE = process.env.APP_ORIGIN ?? "https://useagentcloud.com";

/**
 * Marketing and legal pages are indexable; everything behind auth, the API,
 * and per-agent landing pages are not.
 */
const BODY = `User-agent: *
Allow: /$
Allow: /demo
Allow: /privacy
Allow: /terms
Allow: /cookies
Disallow: /admin
Disallow: /api/
Disallow: /dashboard
Disallow: /settings
Disallow: /agency
Disallow: /account
Disallow: /contracting
Disallow: /login
Disallow: /signup
Disallow: /reset-password
Disallow: /forgot-password

Sitemap: ${SITE}/sitemap.xml
`;

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(BODY, {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
        }),
    },
  },
});
