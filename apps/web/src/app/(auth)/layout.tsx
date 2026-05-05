import type { Metadata } from "next";
import type React from "react";
import "./auth.css";

export const metadata: Metadata = {
  title: "Sign in · Backhaul Bucket",
  description: "Secure access for dispatch operations"
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const showDevAutofill =
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_DEV_AUTOFILL === "true";

  return (
    <div className="db-auth-root">
      <aside className="db-auth-panel">
        <div className="db-auth-brand">
          <h1 className="db-auth-brand-name">
            <span className="db-auth-brand-accent">BACKHAUL</span> BUCKET
          </h1>
          <span className="db-region-badge mono">PHASE 1 · NORTHEAST</span>
        </div>
        <p className="db-auth-panel-copy">
          Secure access to daily board, review queue, and KPI workflows for authorized operations roles.
        </p>
      </aside>
      <section className="db-auth-main">
        <div className="db-auth-main-inner">
          {showDevAutofill ? <p className="db-auth-banner warn">DEV MODE: sign-in autofill helper is enabled.</p> : null}
          {children}
        </div>
      </section>
    </div>
  );
}
