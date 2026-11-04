import { useEffect, useState, type FormEvent } from "react";
import {
  stagingJson,
  stagingRequest,
  type StagingAuthStep,
  type StagingSession,
} from "./client";
import "./staging.css";
import { StagingRecoveryForm } from "./client-recovery";

export function StagingLogin({
  workspace,
  onAuthenticated,
  initialError = "",
}: {
  workspace: "manager" | "accountant";
  onAuthenticated: (session: StagingSession) => Promise<void> | void;
  initialError?: string;
}) {
  const [step, setStep] = useState<StagingAuthStep | null>(null);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);
  const accountant = workspace === "accountant";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      const next = step
        ? await stagingRequest<StagingAuthStep>(
            "/auth/mfa/verify",
            stagingJson({ code: data.code }, step.csrf),
          )
        : await stagingRequest<StagingAuthStep>(
            "/auth/login",
            stagingJson({
              email: data.email,
              password: data.password,
              workspace,
            }),
          );
      if (next.status === "authenticated") {
        const session = await stagingRequest<StagingSession>("/auth/session");
        if (session.workspace !== workspace)
          throw Error("This account does not have access to this workspace.");
        await onAuthenticated(session);
      } else setStep(next);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Sign in could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const qr = step?.qrCode || step?.qr;
  const qrSource = qr?.trim().startsWith("<svg")
    ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(qr)))}`
    : qr?.startsWith("data:image/")
      ? qr
      : undefined;
  return (
    <main className="staging-login">
      <section
        className="staging-login-story"
        aria-label={`AZZORA ${accountant ? "Accounts" : "Manager"} introduction`}
      >
        <div className="staging-brand">
          <img src="/assets/azzora-logo.png" alt="AZZORA" />
          <strong>{accountant ? "ACCOUNTS" : "PROJECT CONTROL"}</strong>
        </div>
        <div>
          <span className="eyebrow">
            {accountant ? "FINANCIAL MANAGEMENT" : "DESIGN · BUILD · DELIVER"}
          </span>
          <h1>
            {accountant
              ? "Clarity in every account."
              : "Your projects, connected."}
          </h1>
          <p>
            {accountant
              ? "Invoices, payments and statements in your independent Accountant workspace."
              : "Customers, quotations and project delivery in your Manager workspace."}
          </p>
        </div>
        <small>AZZORA · DESIGN & BUILD</small>
      </section>
      <section className="staging-login-side">
        <div className="staging-login-card">
          <img
            className="staging-mobile-logo"
            src="/assets/azzora-logo.png"
            alt="AZZORA"
          />
          <span className="eyebrow">
            {accountant ? "ACCOUNTANT WORKSPACE" : "MANAGER WORKSPACE"}
          </span>
          {recovering ? (
            <StagingRecoveryForm
              workspace={workspace}
              onBack={() => setRecovering(false)}
            />
          ) : (
            <>
              <h2>
                {step
                  ? step.status === "mfa-enroll"
                    ? "Set up your authenticator"
                    : "Verify your sign-in"
                  : `Sign in to ${accountant ? "Accounts" : "Manager"}`}
              </h2>
              <p>
                {step
                  ? "Enter the current six-digit code from your authenticator app."
                  : "Use your individual staging account."}
              </p>
              <div className="staging-scope-note">
                <strong>FICTIONAL STAGING</strong>
                <span>
                  Shared test records only. Real financial posting is disabled.
                </span>
              </div>
              {step?.status === "mfa-enroll" && (
                <div className="staging-enrollment">
                  {qrSource && (
                    <img
                      src={qrSource}
                      alt="Scan this code in your authenticator app"
                    />
                  )}
                  {step.uri && (
                    <details>
                      <summary>Manual authenticator setup</summary>
                      <code>{step.uri}</code>
                    </details>
                  )}
                  <p>
                    This enrollment belongs to your authenticated sign-in. Keep
                    the setup details private.
                  </p>
                </div>
              )}
              <form onSubmit={submit} aria-busy={busy}>
                {!step ? (
                  <>
                    <label htmlFor={`staging-${workspace}-email`}>Email</label>
                    <input
                      id={`staging-${workspace}-email`}
                      type="email"
                      name="email"
                      autoComplete="username"
                      required
                      disabled={busy}
                    />
                    <label htmlFor={`staging-${workspace}-password`}>
                      Password
                    </label>
                    <input
                      id={`staging-${workspace}-password`}
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      required
                      disabled={busy}
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor={`staging-${workspace}-code`}>
                      Authenticator code
                    </label>
                    <input
                      id={`staging-${workspace}-code`}
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      autoFocus
                      disabled={busy}
                    />
                  </>
                )}
                <button className="primary" type="submit" disabled={busy}>
                  {busy
                    ? "Checking…"
                    : step
                      ? "Verify and continue"
                      : "Sign in"}
                </button>
              </form>
              {step && (
                <button
                  type="button"
                  className="staging-text-button"
                  disabled={busy}
                  onClick={() => {
                    setStep(null);
                    setError("");
                  }}
                >
                  Use another account
                </button>
              )}
              {error && (
                <p role="alert" className="staging-error">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="staging-text-button"
                disabled={busy}
                onClick={() => {
                  setRecovering(true);
                  setStep(null);
                  setError("");
                }}
              >
                Use an Owner recovery code
              </button>
              <p className="staging-login-foot">
                Individual access is verified by the staging identity service.
                Production use and real accounting remain unavailable.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
