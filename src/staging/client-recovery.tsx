import { useState, type FormEvent } from "react";
import { stagingJson, stagingRequest, type StagingSession } from "./client";
type Step = {
  status: "mfa-challenge" | "reset-password" | "recovered";
  csrf?: string;
  message?: string;
};
export function StagingRecoveryForm({
  workspace,
  onBack,
}: {
  workspace: "manager" | "accountant";
  onBack: () => void;
}) {
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    setBusy(true);
    try {
      let next: Step;
      if (!step)
        next = await stagingRequest(
          "/auth/recovery/verify",
          stagingJson({ handoffCode: data.handoffCode, workspace }),
        );
      else if (step.status === "mfa-challenge")
        next = await stagingRequest(
          "/auth/recovery/mfa",
          stagingJson({ code: data.code }, step.csrf),
        );
      else {
        if (data.newPassword !== data.confirmPassword)
          throw Error("The two passwords must match.");
        next = await stagingRequest(
          "/auth/recovery/password",
          stagingJson({ newPassword: data.newPassword }, step.csrf),
        );
      }
      setStep(next);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Recovery could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>
        {step?.status === "recovered"
          ? "Password changed"
          : step?.status === "mfa-challenge"
            ? "Verify your authenticator"
            : step?.status === "reset-password"
              ? "Choose a new password"
              : "Recover staging access"}
      </h2>
      <div className="staging-scope-note">
        <strong>MANUAL STAGING RECOVERY</strong>
        <span>
          Ask the signed-in Owner for a one-time recovery code. This test flow
          sends no email and applies only to the four fictional accounts.
        </span>
      </div>
      {step?.status === "recovered" ? (
        <p role="status">
          {step.message} Email delivery has not been verified.
        </p>
      ) : (
        <form onSubmit={submit} aria-busy={busy}>
          {!step ? (
            <>
              <label htmlFor="staging-recovery-code">Owner recovery code</label>
              <input
                id="staging-recovery-code"
                type="password"
                name="handoffCode"
                autoComplete="off"
                required
                disabled={busy}
              />
              <p>Codes expire after ten minutes and can be used once.</p>
            </>
          ) : step.status === "mfa-challenge" ? (
            <>
              <label htmlFor="staging-recovery-mfa">Authenticator code</label>
              <input
                id="staging-recovery-mfa"
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                disabled={busy}
              />
              <p>
                Your existing verified factor is required. Lost MFA needs a
                separate identity review.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="staging-new-password">New password</label>
              <input
                id="staging-new-password"
                type="password"
                name="newPassword"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                disabled={busy}
              />
              <label htmlFor="staging-confirm-password">
                Confirm new password
              </label>
              <input
                id="staging-confirm-password"
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                disabled={busy}
              />
              <p>
                Use uppercase, lowercase and a number. Existing sessions will be
                revoked.
              </p>
            </>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Verifying…"
              : !step
                ? "Verify recovery code"
                : step.status === "mfa-challenge"
                  ? "Verify authenticator"
                  : "Change password"}
          </button>
        </form>
      )}
      {error && (
        <p className="staging-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="staging-text-button"
        onClick={onBack}
        disabled={busy}
      >
        Return to sign in
      </button>
    </>
  );
}
export function OwnerRecoveryPanel({ session }: { session: StagingSession }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  if (session.role !== "owner_admin") return null;
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    setCode("");
    setShow(false);
    try {
      const result = await stagingRequest<{ handoffCode: string }>(
        "/auth/recovery/start",
        stagingJson({ email: data.email, code: data.code }, session.csrf),
      );
      setCode(result.handoffCode);
      form.reset();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Recovery code could not be issued.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="staging-scope-note">
      <summary>Owner-assisted account recovery</summary>
      <div className="staging-login-card">
        <p>
          Fictional staging only. No email is sent. Verify the test user before
          privately handing over the code.
        </p>
        <form onSubmit={issue} aria-busy={busy}>
          <label htmlFor="owner-recovery-email">Fictional account</label>
          <select id="owner-recovery-email" name="email" disabled={busy}>
            {["engineer", "manager", "accountant", "owner"].map((name) => (
              <option key={name}>{name}@staging.azzora.test</option>
            ))}
          </select>
          <label htmlFor="owner-recovery-totp">
            Fresh Owner authenticator code
          </label>
          <input
            id="owner-recovery-totp"
            name="code"
            type="password"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            disabled={busy}
          />
          <small>
            If you just signed in, wait for the next authenticator code.
          </small>
          <button className="primary" disabled={busy}>
            {busy ? "Verifying…" : "Issue one-time recovery code"}
          </button>
        </form>
        {code && (
          <div role="status">
            <p>
              Code issued for private handoff. Expires in ten minutes. No email
              was sent.
            </p>
            <label htmlFor="owner-issued-recovery">
              One-time recovery code
            </label>
            <input
              id="owner-issued-recovery"
              readOnly
              type={show ? "text" : "password"}
              value={code}
              autoComplete="off"
            />
            <button
              type="button"
              className="staging-text-button"
              aria-pressed={show}
              onClick={() => setShow(!show)}
            >
              {show ? "Hide code" : "Show code"}
            </button>{" "}
            <button
              type="button"
              className="staging-text-button"
              onClick={() => {
                setCode("");
                setShow(false);
              }}
            >
              Clear displayed code
            </button>
          </div>
        )}
        {error && (
          <p className="staging-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
