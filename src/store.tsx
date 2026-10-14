import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Database } from "./domain/model";
import { localRepository } from "./domain/repository";
import { seed } from "./domain/seed";
import { initializeCommercial } from "./commercial/migration";
interface Store {
  db: Database;
  mutate: (fn: (db: Database) => void, message?: string) => boolean;
  toast: string;
  error: string;
  clear: () => void;
  reset: () => void;
}
const Context = createContext<Store | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const [error, setError] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [db, setDb] = useState<Database>(() => {
    try {
      return localRepository.load();
    } catch (e) {
      setError(
        "Saved data could not be loaded. Showing a read-only demo fallback; original data is preserved. Export original saved data from Settings. " +
          String(e),
      );
      setReadOnly(true);
      const fallback = seed();
      initializeCommercial(fallback);
      return fallback;
    }
  });
  const [toast, setToast] = useState("");
  const current = useRef(db);
  function mutate(
    fn: (db: Database) => void,
    message = "Changes saved to this browser",
  ) {
    try {
      if (readOnly)
        throw Error(
          "Saved data could not be loaded. Writes are disabled to protect it. Export the original saved data in Settings or explicitly reset the demo.",
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
        clear: () => {
          setToast("");
          setError("");
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
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw Error("Store unavailable");
  return store;
}
