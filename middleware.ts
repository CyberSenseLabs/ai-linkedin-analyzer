import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything under /dashboard and the enrichment API requires a signed-in user.
// The landing page, sign-in and sign-up routes stay public.
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/api/enrich(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  // Clerk's middleware relies on Node.js APIs (crypto, etc.) that aren't
  // available in the Edge runtime. Node.js middleware is stable as of
  // Next.js 15.5, so this just needs the runtime set explicitly.
  runtime: "nodejs",
  matcher: [
    // Skip Next.js internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
