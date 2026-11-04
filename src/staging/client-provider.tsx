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
  stagingJson,
  stagingRequest,
  type StagingSession,
} from "./client";
import "./staging.css";

type ManagerSnapshot = {
  db: Database;
  version: number;
  expenseSubmissions?: StagingExpenseSubmission[];
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
  const [toast, setToast] = useState("");
  const [pending, setPending] = useState(0);
  const sessionRef = useRef<StagingSession | null>(null);
  const current = useRef<ManagerSnapshot | null>(null);
  const tail = useRef<Promise<void>>(Promise.resolve());
  const failure = useRef("");
  const retries = useRef<Intent[]>([]);
  const generation = useRef(0);
  const attempt = useRef<{
    fingerprint: string;
    key: string;
    version: number;
  } | null>(null);
  const activeCommands = useRef(0);
  const apply = useCallback((next: ManagerSnapshot) => {
    current.current = next;
    setSnapshot(next);
  }, []);
  const load = useCallback(async () => {
    const identity = sessionRef.current;
    const before = current.current;
    const next = await stagingRequest<ManagerSnapshot>("/manager/snapshot");
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
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID(), version };
    const result = await stagingRequest<
      ManagerSnapshot & { snapshot?: ManagerSnapshot }
    >(
      "/manager/command",
      stagingJson(
        {
          ...intent,
          idempotencyKey: attempt.current.key,
          expectedVersion: attempt.current.version,
        },
        user.csrf,
      ),
    );
    const next = result.snapshot || result;
    if (!next.db || !Number.isSafeInteger(next.version))
      throw Error("The server did not confirm the saved record.");
    attempt.current = null;
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
    setError("");
    activeCommands.current += 1;
    setPending((value) => value + 1);
    // Reserve our place synchronously: two forms must never send the same company version.
    const operation = tail.current.then(async () => {
      try {
        if (failure.current) throw Error(failure.current);
        const next = await send({ kind, payload });
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
      attempt.current = null;
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
          <strong>FICTIONAL SHARED STAGING</strong>
          <span>{session.email}</span>
          <span>Real posting disabled</span>
        </div>
        <div>
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
      {children}
    </StoreContext.Provider>
  );
}
