import { useEffect, useState, type FormEvent } from "react";
import { productionEnabled } from "./client";

/** Private single-use links keep their proof in the fragment, never a server query or saved browser storage. */
let capturedSetupToken: string | undefined;
export function consumeProductionSetupLink(): string {
  if (capturedSetupToken !== undefined) return capturedSetupToken;
  if (!productionEnabled || typeof location === "undefined") return "";
  const fields = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (!fields.has("setup_token")) return "";
  const token = fields.get("setup_token") || "";
  history.replaceState(null, "", location.pathname + location.search);
  capturedSetupToken = /^[A-Za-z0-9_-]{32,256}$/.test(token)
    ? token
    : "invalid";
  return capturedSetupToken;
}
export function clearProductionSetupLink() {
  capturedSetupToken = "";
}

export function ProductionCredentialSetup({
  tokenHash,
  onComplete,
}: {
  tokenHash: string;
  onComplete: () => void;
}) {
  const [csrf, setCsrf] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/staging/auth/credential-setup", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || typeof data.csrf !== "string") throw Error();
        if (active) setCsrf(data.csrf);
      })
      .catch(() => {
        if (active)
          setError(
            "Setup is unavailable. Refresh the page or request a new private setup link.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form),
      password = String(data.get("password") || "");
    if (password !== data.get("confirm")) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await fetch("/api/staging/auth/credential-setup", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Azzora-Setup-CSRF": csrf,
        },
        body: JSON.stringify({ tokenHash, password }),
      });
      const body = await result.json();
      if (!result.ok)
        throw Error(
          body.error ||
            "Setup could not be confirmed. Try signing in or request a new link.",
        );
      form.reset();
      setDone(true);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Setup could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="staging-login">
      <section className="staging-login-side">
        <div className="staging-login-card">
          <img
            className="staging-mobile-logo"
            src="/assets/azzora-logo.png"
            alt="AZZORA"
          />
          <span className="eyebrow">INDIVIDUAL ACCOUNT SETUP</span>
          <h1>{done ? "Your password is set" : "Choose your password"}</h1>
          <p>
            {done
              ? "Sign in with your email and password. Financial posting remains disabled pending company approval."
              : "This private link sets your individual password. Keep the link private."}
          </p>
          {error && <p role="alert">{error}</p>}
          {done ? (
            <button type="button" onClick={onComplete}>
              Continue to sign in
            </button>
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="setup-password">New password</label>
              <input
                id="setup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
                disabled={busy}
              />
              <label htmlFor="setup-confirm">Confirm password</label>
              <input
                id="setup-confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
                disabled={busy}
              />
              <p>
                Use at least 12 characters. Do not send your password by email
                or chat.
              </p>
              <button
                type="submit"
                disabled={!csrf || busy || tokenHash === "invalid"}
              >
                {busy ? "Setting password…" : "Set password"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
