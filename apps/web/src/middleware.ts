import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/** Pages enforce Clerk in RSC; listing them here avoids edge-auth navigation flakes. */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/dashboard(.*)",
  "/review(.*)",
  "/visual-regression(.*)"
]);

export default clerkMiddleware(async (auth, req) => {
  // Demo mode: bypass edge auth checks so API routes
  // can be exercised without an active Clerk session.
  if (process.env.BYPASS_AUTH === "true") {
    return;
  }
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico)).*)"]
};
