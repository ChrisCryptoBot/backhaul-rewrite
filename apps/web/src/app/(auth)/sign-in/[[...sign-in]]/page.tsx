import React from "react";
import { SignIn } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { AuthErrorState } from "@/components/auth/auth-error-state";
import { getClerkPublishableKey, hasValidClerkPublishableKey } from "@/lib/auth/clerk-config";

const DevSignInHelperClient = dynamic(
  () => import("@/app/(auth)/sign-in/[[...sign-in]]/dev-signin-helper").then((module) => module.DevSignInHelper),
  { ssr: false }
);

export default function SignInPage() {
  const publishableKey = getClerkPublishableKey();
  const hasValidKey = hasValidClerkPublishableKey(publishableKey);
  const showDevAutofill =
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_DEV_AUTOFILL === "true";

  if (!hasValidKey) {
    return (
      <AuthErrorState
        title="Sign-in unavailable"
        description="Clerk is not configured for this environment."
        hint="Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (or CLERK_PUBLISHABLE_KEY) and refresh."
      />
    );
  }

  return (
    <>
      {showDevAutofill ? <DevSignInHelperClient /> : null}
      <SignIn
        appearance={{
          variables: {
            colorPrimary: "var(--db-accent)",
            colorBackground: "var(--db-bg-elev-2)",
            colorInputBackground: "var(--db-bg-elev-3)",
            colorText: "var(--db-fg)",
            colorTextSecondary: "var(--db-fg-mid)",
            colorDanger: "var(--db-neg)",
            fontFamily: "var(--db-font-ui)"
          },
          elements: {
            rootBox: "db-clerk-root",
            card: "db-clerk-card",
            formButtonPrimary: "db-btn",
            footerActionLink: "db-link"
          }
        }}
      />
    </>
  );
}
