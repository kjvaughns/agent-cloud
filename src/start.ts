import { createStart, createMiddleware } from "@tanstack/react-start";

import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";
import { renderErrorPage } from "./lib/error-page";
import { hostRedirectTarget } from "./lib/hosts";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const hostSplitMiddleware = createMiddleware().server(async ({ next, request }) => {
  const target = hostRedirectTarget(new URL(request.url));
  if (target) return new Response(null, { status: 302, headers: { location: target } }) as never;
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [hostSplitMiddleware, errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
