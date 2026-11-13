import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Database } from "../domain/model";
import {
  StoreContext,
  type Store,
  type StagingExpenseSubmission,
} from "../store";
import { StagingLogin } from "./client-login";
import {
  StagingRequestError,
  productionEnabled,
  stagingJson,
  stagingRequest,
  type StagingSession,
} from "./client";
import "./staging.css";
import { OwnerRecoveryPanel } from "./client-recovery";

type ManagerSnapshot = {
  db: Database;
  version: number;
  expenseSubmissions?: StagingExpenseSubmission[];
  accountantBills?: Store["accountantBills"];
};
type Intent = { kind: string; payload: unknown };
/** A narrow compatibility bridge for the accepted quotation autosave UI only.
 * Every intent still executes the existing validator on the trusted server.
 */
export function quotationIntent(
  previous: Database,
  next: Database,
): Intent | null {
  for (const key of Object.keys(previous) as (keyof Database)[])
    if (
      key !== "quotations" &&
      key !== "activities" &&
      JSON.stringify(previous[key]) !== JSON.stringify(next[key])
    )
      return null;
  const removed = previous.quotations.filter(
    (item) => !next.quotations.some((value) => value.id === item.id),
  );
  const changed = next.quotations.filter(
    (item) =>
      JSON.stringify(item) !==
      JSON.stringify(previous.quotations.find((value) => value.id === item.id)),
  );
  if (removed.length === 1 && !changed.length)
    return { kind: "quotation.delete", payload: { id: removed[0].id } };
  if (removed.length || changed.length !== 1) return null;
  const quotation = changed[0];
  const old = previous.quotations.find((value) => value.id === quotation.id);
  if (old && old.status !== quotation.status)
    return {
      kind: "quotation.status",
      payload: {
        id: quotation.id,
        status: quotation.status,
        notes: quotation.history.at(-1)?.notes || "",
      },
    };
  if (quotation.status !== "Draft") return null;
  return { kind: "quotation.save", payload: { quotation } };
}

export function StagingManagerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StagingSession | null>(null);
  const [snapshot, setSnapshot] = useState<ManagerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const setupKey = useRef<string | null>(null);
  const [toast, setToast] = useState("");
  const [pending, setPending] = useState(0);
  const sessionRef = useRef<StagingSession | null>(null);
  const current = useRef<ManagerSnapshot | null>(null);
  const tail = useRef<Promise<void>>(Promise.resolve());
  const failure = useRef("");
  const retries = useRef<Intent[]>([]);
  const generation = useRef(0);
  const attempts = useRef(new Map<string, { key: string; version: number }>());
  const inFlightCommands = useRef(new Map<string, Promise<boolean>>());
  const activeCommands = useRef(0);
  const apply = useCallback((next: ManagerSnapshot) => {
    current.current = next;
    setSnapshot(next);
  }, []);
  const load = useCallback(async () => {
    const identity = sessionRef.current;
    const before = current.current;
    let next: ManagerSnapshot;
    try {
      next = await stagingRequest<ManagerSnapshot>("/manager/snapshot");
      setNeedsSetup(false);
    } catch (problem) {
      if (
        problem instanceof StagingRequestError &&
        problem.code === "production_company_setup_required"
      ) {
        setNeedsSetup(true);
        return;
      }
      throw problem;
    }
    if (
      identity === sessionRef.current &&
      before === current.current &&
      !activeCommands.current &&
      !retries.current.length
    )
      apply(next);
  }, [apply]);
  const signedIn = useCallback(
    async (value: StagingSession) => {
      if (value.workspace !== "manager")
        throw Error("Sign in to the Manager workspace to continue.");
      sessionRef.current = value;
      setSession(value);
      await load();
    },
    [load],
  );
  useEffect(() => {
    let active = true;
    stagingRequest<StagingSession>("/auth/session")
      .then(async (value) => {
        if (active && value.workspace === "manager") await signedIn(value);
      })
      .catch((problem) => {
        if (
          active &&
          (!(problem instanceof StagingRequestError) || problem.status !== 401)
        )
          setError(
            problem instanceof Error
              ? problem.message
              : "Staging service unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [signedIn]);

  async function send(intent: Intent) {
    const user = sessionRef.current;
    const version = current.current?.version;
    if (!user || version === undefined)
      throw Error("Sign in before saving changes.");
    const fingerprint = JSON.stringify(intent);
    const identityKey = user.userId + ":" + fingerprint;
    let attempt = attempts.current.get(identityKey);
    if (!attempt) {
      if (attempts.current.size >= 100)
        throw Error(
          "Resolve the unconfirmed staging requests before submitting more changes.",
        );
      attempt = { key: crypto.randomUUID(), version };
      attempts.current.set(identityKey, attempt);
    }
    const result = await stagingRequest<
      ManagerSnapshot & { snapshot?: ManagerSnapshot }
    >(
      "/manager/command",
      stagingJson(
        {
          ...intent,
          idempotencyKey: attempt.key,
          expectedVersion: attempt.version,
        },
        user.csrf,
      ),
    );
    const next = result.snapshot || result;
    if (!next.db || !Number.isSafeInteger(next.version))
      throw Error("The server did not confirm the saved record.");
    attempts.current.delete(identityKey);
    return next;
  }
  function enqueue(intent: Intent, optimistic: Database) {
    const queuedGeneration = ++generation.current;
    retries.current.push(intent);
    setPending((value) => value + 1);
    const latest = current.current!;
    apply({ ...latest, db: optimistic });
    tail.current = tail.current.then(async () => {
      try {
        if (failure.current) return;
        await new Promise((resolve) => window.setTimeout(resolve, 160));
        const quoteId = (intent.payload as { quotation?: { id: string } })
          .quotation?.id;
        if (
          quoteId &&
          retries.current
            .slice(1)
            .some(
              (value) =>
                (value.payload as { quotation?: { id: string } }).quotation
                  ?.id === quoteId,
            )
        ) {
          retries.current.shift();
          return;
        }
        const next = await send(intent);
        retries.current.shift();
        if (generation.current === queuedGeneration) apply(next);
        else if (current.current)
          apply({ ...current.current, version: next.version });
      } catch (problem) {
        failure.current =
          problem instanceof Error
            ? problem.message
            : "Quotation draft could not be saved.";
        setError(
          `${failure.current} Your unsaved draft is retained here. Refresh or export it before resolving the conflict.`,
        );
      } finally {
        setPending((value) => value - 1);
      }
    });
  }
  async function flush() {
    await tail.current;
    if (failure.current) throw Error(failure.current);
  }
  function command(
    kind: string,
    payload: unknown,
    message = "Changes saved to shared staging",
  ) {
    const identity = sessionRef.current;
    const key = identity?.userId + ":" + JSON.stringify({ kind, payload });
    const pendingCommand = inFlightCommands.current.get(key);
    if (pendingCommand) return pendingCommand;
    setError("");
    activeCommands.current += 1;
    setPending((value) => value + 1);
    // Reserve our place synchronously: two forms must never send the same company version.
    const operation = tail.current.then(async () => {
      try {
        if (failure.current) throw Error(failure.current);
        if (identity !== sessionRef.current)
          throw Error(
            "Your staging identity changed. Sign in before retrying.",
          );
        const next = await send({ kind, payload });
        if (identity !== sessionRef.current)
          throw Error(
            "The prior identity response was discarded. Refresh your authorized records.",
          );
        apply(next);
        setToast(message);
        return true;
      } catch (problem) {
        setError(
          problem instanceof Error
            ? problem.message
            : "Changes could not be saved.",
        );
        return false;
      } finally {
        activeCommands.current -= 1;
        setPending((value) => Math.max(0, value - 1));
      }
    });
    inFlightCommands.current.set(key, operation);
    void operation.finally(() => inFlightCommands.current.delete(key));
    tail.current = operation.then(() => {});
    return operation;
  }
  async function logout() {
    try {
      await flush();
      await stagingRequest(
        "/auth/logout",
        stagingJson({}, sessionRef.current?.csrf),
      );
      sessionRef.current = null;
      current.current = null;
      setSession(null);
      setSnapshot(null);
      setError("");
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Sign out could not be completed.",
      );
    }
  }
  async function refresh() {
    if (retries.current.length || pending || activeCommands.current) return;
    try {
      await load();
    } catch (problem) {
      if (problem instanceof StagingRequestError && problem.status === 401) {
        setSession(null);
        setSnapshot(null);
        sessionRef.current = null;
        current.current = null;
      } else
        setError(
          problem instanceof Error
            ? problem.message
            : "Shared records could not be refreshed.",
        );
    }
  }
  useEffect(() => {
    if (!session) return;
    const update = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", update);
    const timer = window.setInterval(update, 15_000);
    return () => {
      window.removeEventListener("focus", update);
      clearInterval(timer);
    };
  });

  function exportUnsaved() {
    if (!current.current) return;
    const object = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              mode: "fictional-staging-unsaved-review",
              version: current.current.version,
              pending: retries.current,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = object;
    anchor.download = "azzora-staging-unsaved-drafts.json";
    anchor.click();
    URL.revokeObjectURL(object);
  }
  async function reloadAfterConflict() {
    if (
      !window.confirm(
        "Reload shared records and discard the unsaved quotation held in this tab? Export the unsaved draft first if you need to keep it.",
      )
    )
      return;
    try {
      await tail.current;
      retries.current = [];
      failure.current = "";
      attempts.current.clear();
      setPending(0);
      await load();
      setError("");
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Shared records could not be reloaded.",
      );
    }
  }
  if (loading)
    return (
      <main className="staging-loading" role="status">
        Opening your Manager workspace…
      </main>
    );
  if (session && needsSetup && !snapshot)
    return (
      <main className="staging-login">
        <section className="staging-login-side">
          <div className="staging-login-card">
            <h1>Set up your AZZORA workspace</h1>
            <p>
              This creates an empty, persistent company workspace. No sample
              records, balances, tax approval or financial postings will be
              created.
            </p>
            <p>
              Company policies, opening balances and cutover remain pending
              Owner and Accountant approval.
            </p>
            {session.role === "owner_admin" ? (
              <button
                className="primary"
                disabled={settingUp}
                onClick={async () => {
                  if (settingUp) return;
                  setSettingUp(true);
                  setError("");
                  setupKey.current ||= crypto.randomUUID();
                  try {
                    await stagingRequest(
                      "/manager/setup",
                      stagingJson(
                        { idempotencyKey: setupKey.current },
                        session.csrf,
                      ),
                    );
                    await load();
                  } catch (problem) {
                    setError(
                      problem instanceof Error
                        ? problem.message
                        : "Workspace setup was not confirmed. Refresh before retrying.",
                    );
                  } finally {
                    setSettingUp(false);
                  }
                }}
              >
                {settingUp
                  ? "Preparing workspace…"
                  : "Create empty company workspace"}
              </button>
            ) : (
              <p>The Owner must initialize the company workspace first.</p>
            )}
            {error && (
              <p role="alert" className="staging-error">
                {error}
              </p>
            )}
            <button type="button" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </section>
      </main>
    );
  if (!session || !snapshot)
    return (
      <StagingLogin
        workspace="manager"
        onAuthenticated={signedIn}
        initialError={error}
      />
    );
  const store: Store = {
    mode: "staging",
    db: snapshot.db,
    toast,
    error,
    command,
    flush,
    latestDb: () => current.current!.db,
    actor: session,
    expenseSubmissions: snapshot.expenseSubmissions,
    accountantBills: snapshot.accountantBills,
    mutate(fn, message = "") {
      if (activeCommands.current) {
        setError(
          "Wait for the shared staging change to finish before editing this draft.",
        );
        return false;
      }
      if (failure.current) {
        setError(
          "Resolve or export the unsaved quotation before making another change.",
        );
        return false;
      }
      try {
        const previous = current.current!.db;
        const next = structuredClone(previous);
        fn(next);
        const intent = quotationIntent(previous, next);
        if (!intent)
          throw Error(
            "This action requires its authorized staging command and cannot save to browser storage.",
          );
        if (intent.kind !== "quotation.save") {
          void command(intent.kind, intent.payload, message);
          return true;
        }
        enqueue(intent, next);
        if (message) setToast("Quotation draft queued for shared staging");
        return true;
      } catch (problem) {
        setError(
          problem instanceof Error
            ? problem.message
            : "This staging action is unavailable.",
        );
        return false;
      }
    },
    clear() {
      setToast("");
      if (!failure.current) setError("");
    },
    reset() {
      setError("Shared staging records cannot be reset from this workspace.");
    },
    exportOriginal: exportUnsaved,
  };
  return (
    <StoreContext.Provider value={store}>
      <div className="staging-session-bar">
        <div>
          <strong>
            {productionEnabled
              ? "AZZORA COMPANY WORKSPACE"
              : "FICTIONAL SHARED STAGING"}
          </strong>
          <span>{session.email}</span>
          <span>Real posting disabled</span>
        </div>
        <div>
          {session.role === "owner_admin" && (
            <a className="button" href="/api/staging/manager/backup" download>
              {productionEnabled
                ? "Download encrypted backup"
                : "Download staging backup"}
            </a>
          )}
          <button
            type="button"
            disabled={pending > 0}
            onClick={() => void refresh()}
          >
            Refresh records
          </button>
          <button type="button" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </div>
      {(pending > 0 || error) && (
        <div
          className="staging-session-status"
          data-error={!!error}
          role={error ? "alert" : "status"}
        >
          {error || "Saving to shared staging…"}
          {failure.current && (
            <>
              <button type="button" onClick={exportUnsaved}>
                Export unsaved draft
              </button>
              <button type="button" onClick={() => void reloadAfterConflict()}>
                Reload shared records
              </button>
            </>
          )}
        </div>
      )}
      {session.role === "owner_admin" && (
        <OwnerRecoveryPanel session={session} />
      )}
      {children}
    </StoreContext.Provider>
  );
}
