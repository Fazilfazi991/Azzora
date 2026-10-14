import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

/** Capture this dialog's rejected attempt without dismissing global protection
 * messages. Keep the actual failure visible even if a global toast expires. */
export function FinancialDialogError({ attempt }: { attempt: number }) {
  const { error } = useStore();
  const [message, setMessage] = useState("");
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!attempt) setMessage("");
    else if (error) setMessage(error);
  }, [attempt, error]);
  useEffect(() => {
    if (!attempt || !message) return;
    alert.current?.focus({ preventScroll: true });
    alert.current?.scrollIntoView({ block: "nearest" });
  }, [attempt, message]);
  if (!attempt || !message) return null;
  return (
    <p
      ref={alert}
      className="error"
      role="alert"
      aria-atomic="true"
      tabIndex={-1}
    >
      {message}
    </p>
  );
}
