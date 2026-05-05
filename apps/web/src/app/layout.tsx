import "./globals.css";
import type { Metadata } from "next";
import React from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { getClerkPublishableKey, hasValidClerkPublishableKey } from "@/lib/auth/clerk-config";

export const metadata: Metadata = {
  title: "Backhaul Phase 1",
  description: "NE operational flow bootstrap"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publishableKey = getClerkPublishableKey();
  const hasValidClerkKey = hasValidClerkPublishableKey(publishableKey);
  const isProduction = process.env.NODE_ENV === "production";
  const isCi = process.env.CI === "true";

  if (!hasValidClerkKey && isProduction && !isCi) {
    throw new Error("Missing or invalid Clerk publishable key in production.");
  }

  return (
    <html lang="en">
      <body>
        {hasValidClerkKey ? (
          <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
