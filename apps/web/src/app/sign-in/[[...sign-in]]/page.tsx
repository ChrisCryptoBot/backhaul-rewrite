import { SignIn } from "@clerk/nextjs";
import dynamic from "next/dynamic";

const DevSignInHelperClient = dynamic(
  () => import("./dev-signin-helper").then((module) => module.DevSignInHelper),
  { ssr: false }
);

export default function SignInPage() {
  const publishableKey =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
  const showDevAutofill =
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_DEV_AUTOFILL === "true";

  if (!publishableKey) {
    return (
      <main>
        <h1>Sign-in unavailable</h1>
        <p>Clerk is not configured for this environment.</p>
        <p>Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (or CLERK_PUBLISHABLE_KEY) and refresh.</p>
      </main>
    );
  }

  return (
    <main>
      {showDevAutofill ? <DevSignInHelperClient /> : null}
      <SignIn />
    </main>
  );
}
