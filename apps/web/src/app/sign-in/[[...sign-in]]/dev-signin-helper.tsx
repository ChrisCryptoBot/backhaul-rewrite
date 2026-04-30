"use client";

import React from "react";

const DEFAULT_TEST_EMAIL = "dev@example.invalid";
const DEFAULT_TEST_PASSWORD = "REDACTED_DEV_PASSWORD";

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function DevSignInHelper() {
  const [message, setMessage] = React.useState<string | null>(null);

  const fillInputs = React.useCallback(() => {
    const emailInput = document.querySelector<HTMLInputElement>(
      "input[name='identifier'], input[name='emailAddress'], input[type='email']"
    );
    const passwordInput = document.querySelector<HTMLInputElement>("input[name='password'], input[type='password']");

    if (!emailInput || !passwordInput) {
      setMessage("Could not find sign-in fields yet. Wait for form to load, then try again.");
      return null;
    }

    const testEmail = process.env.NEXT_PUBLIC_DEV_TEST_LOGIN_EMAIL ?? DEFAULT_TEST_EMAIL;
    const testPassword = process.env.NEXT_PUBLIC_DEV_TEST_LOGIN_PASSWORD ?? DEFAULT_TEST_PASSWORD;

    setInputValue(emailInput, testEmail);
    setInputValue(passwordInput, testPassword);
    passwordInput.focus();
    return { emailInput, passwordInput };
  }, []);

  const handleAutofill = React.useCallback(() => {
    const inputs = fillInputs();
    if (!inputs) {
      return;
    }
    setMessage("Test credentials autofilled.");
  }, [fillInputs]);

  const handleAutofillAndSubmit = React.useCallback(() => {
    const inputs = fillInputs();
    if (!inputs) {
      return;
    }

    const form = inputs.passwordInput.closest("form");
    if (!form) {
      setMessage("Could not find the sign-in form to submit.");
      return;
    }

    form.requestSubmit();
    setMessage("Test credentials autofilled and submitted.");
  }, [fillInputs]);

  return (
    <section style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="db-btn" onClick={handleAutofill}>
          Autofill Test Login
        </button>
        <button type="button" className="db-btn" onClick={handleAutofillAndSubmit}>
          Autofill + Submit
        </button>
      </div>
      {message ? (
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--db-fg-mid)" }} aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
