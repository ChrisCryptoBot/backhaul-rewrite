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
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico)).*)"]
};
