import {
  Component,
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Database } from "./domain/model";
import { decodeSavedData, localRepository } from "./domain/repository";
import { seed } from "./domain/seed";
import { initializeCommercial } from "./commercial/migration";
interface Store {
  db: Database;
  mutate: (fn: (db: Database) => void, message?: string) => boolean;
  toast: string;
  error: string;
  clear: () => void;
  reset: () => void;
  exportOriginal: () => void;
}
const Context = createContext<Store | null>(null);
const KEY = "azzora-demo-v1";
function bootstrap() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    return { db: decodeSavedData(raw), raw, error: "", readOnly: false };
  } catch (e) {
    const db = seed();
    initializeCommercial(db);
    return {
      db,
      raw,
      readOnly: true,
      error:
        "Saved data could not be loaded. Original data is preserved; writes are disabled. " +
        String(e),
    };
  }
}
function downloadOriginal(raw: string) {
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "azzora-original-saved-data.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
class RenderRecovery extends Component<
  {
    children: ReactNode;
    onFailure: (error: Error) => void;
    exportOriginal: () => void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onFailure(error);
  }
  render() {
    return this.state.failed ? (
      <section className="panel" role="alert">
        <h2>Workspace could not open</h2>
        <p>
          Your saved records have not been reset. Export a backup before
          correcting the data or reloading.
        </p>
        <button onClick={this.props.exportOriginal}>
          Export original saved data
        </button>
        <button onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
export function Provider({ children }: { children: ReactNode }) {
  const [initial] = useState(bootstrap);
  const [error, setError] = useState(initial.error),
    [readOnly, setReadOnly] = useState(initial.readOnly),
    [original, setOriginal] = useState(initial.raw);
  const [db, setDb] = useState(initial.db),
    [toast, setToast] = useState("");
  const current = useRef(db);
  function exportOriginal() {
    try {
      const raw = readOnly ? original : localStorage.getItem(KEY);
      if (raw === null)
        throw Error(
          "No original saved data could be read. Browser storage may be unavailable; retry without clearing it.",
        );
      downloadOriginal(raw);
    } catch (e) {
      setError(String(e));
    }
  }
  function mutate(
    fn: (db: Database) => void,
    message = "Changes saved to this browser",
  ) {
    try {
      if (readOnly)
        throw Error(
          "Writes are disabled to protect original saved data. Export a backup and correct the data before retrying.",
        );
      const next = structuredClone(current.current);
      fn(next);
      localRepository.save(next);
      current.current = next;
      setDb(next);
      setError("");
      setToast(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  return (
    <Context.Provider
      value={{
        db,
        mutate,
        toast,
        error,
        exportOriginal,
        clear: () => {
          setToast("");
          if (!readOnly) setError("");
        },
        reset: () => {
          try {
            const next = seed();
            initializeCommercial(next);
            localRepository.save(next);
            current.current = next;
            setDb(next);
            setReadOnly(false);
            setError("");
            setToast("Demo data reset");
          } catch (e) {
            setError(String(e));
          }
        },
      }}
    >
      {readOnly && (
        <section
          className="panel"
          role="region"
          aria-label="Saved data recovery"
          style={{ margin: 24, position: "relative", zIndex: 100 }}
        >
          <small>AZZORA · Saved data recovery</small>
          <h1>Your saved records are protected</h1>
          <p>
            The workspace below is a read-only fallback. Original saved data has
            not been replaced.
          </p>
          <p role="alert">{error}</p>
          <div className="actions">
            <button
              className="primary"
              disabled={original === null}
              onClick={exportOriginal}
            >
              Export original saved data
            </button>
            <button
              onClick={() => {
                const next = bootstrap();
                setOriginal(next.raw);
                setError(next.error);
                if (!next.readOnly) {
                  current.current = next.db;
                  setDb(next.db);
                  setReadOnly(false);
                  setToast("Saved data loaded without replacing records");
                }
              }}
            >
              Retry saved data
            </button>
            <a className="button" href="#/settings">
              Recovery settings
            </a>
          </div>
          {original === null && (
            <p>
              Browser storage could not be read. Restore access and retry; no
              saved records have been changed.
            </p>
          )}
        </section>
      )}
      <RenderRecovery
        exportOriginal={exportOriginal}
        onFailure={(e) => {
          try {
            setOriginal(localStorage.getItem(KEY));
          } catch {
            /* Retain the captured backup when storage is unavailable. */
          }
          setReadOnly(true);
          setError(
            "Workspace rendering failed. Original data is preserved. " +
              e.message,
          );
        }}
      >
        {children}
      </RenderRecovery>
    </Context.Provider>
  );
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw Error("Store unavailable");
  return store;
}
