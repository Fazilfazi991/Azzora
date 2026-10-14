import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Download, Printer, X } from "lucide-react";
import type { Quotation } from "./model";
import {
  downloadPdf,
  layoutQuotation,
  pageSvg,
  printQuotation,
} from "./document";
import { validationErrors } from "./repository";
import "./quotation-live-preview.css";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

export function QuotationLivePreview({
  quotation,
  onClose,
}: {
  quotation: Quotation;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const noteId = useId();
  const [zoom, setZoom] = useState("fit");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const document = useMemo(() => {
    try {
      return {
        pages: layoutQuotation(quotation).map(pageSvg),
        issues: validationErrors(quotation),
        error: "",
      };
    } catch (error) {
      return { pages: [], issues: [], error: errorMessage(error) };
    }
  }, [quotation]);
  const draft =
    quotation.status === "Draft" ||
    !quotation.finalizedAt ||
    document.issues.length > 0;

  useEffect(() => {
    const panel = dialog.current;
    const opener =
      window.document.activeElement instanceof HTMLElement
        ? window.document.activeElement
        : null;
    const previousOverflow = window.document.body.style.overflow;
    panel?.showModal();
    window.document.body.style.overflow = "hidden";
    return () => {
      panel?.close();
      window.document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  async function download() {
    setActionError("");
    setBusy(true);
    try {
      await downloadPdf(quotation);
    } catch (error) {
      setActionError(
        "Could not download the quotation PDF. " + errorMessage(error),
      );
    } finally {
      setBusy(false);
    }
  }

  function print() {
    setActionError("");
    try {
      printQuotation(quotation);
    } catch (error) {
      setActionError("Could not print the quotation. " + errorMessage(error));
    }
  }

  return (
    <dialog
      ref={dialog}
      className="quotation-live-preview"
      aria-labelledby={titleId}
      aria-describedby={noteId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        event.stopPropagation();
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), select:not([disabled]), [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (
          (event.shiftKey && window.document.activeElement === first) ||
          (!event.shiftKey && window.document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
    >
      <header className="quotation-live-preview__header">
        <div>
          <h2 id={titleId}>Quotation preview</h2>
          <p>
            {quotation.number}
            {quotation.revision ? ` · Rev ${quotation.revision}` : ""} ·{" "}
            {document.pages.length} page{document.pages.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="quotation-live-preview__close"
        >
          <X size={18} aria-hidden="true" /> Back to Editing
        </button>
      </header>
      <div className="quotation-live-preview__toolbar">
        <label className="quotation-live-preview__zoom">
          Zoom
          <select
            aria-label="Zoom"
            value={zoom}
            onChange={(event) => setZoom(event.target.value)}
          >
            <option value="fit">Fit to width</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
          </select>
        </label>
        <div className="quotation-live-preview__actions">
          <button
            type="button"
            onClick={print}
            disabled={busy || !!document.error}
          >
            <Printer size={16} aria-hidden="true" /> Print
          </button>
          <button
            type="button"
            className="primary"
            onClick={download}
            disabled={busy || !!document.error}
          >
            <Download size={16} aria-hidden="true" />{" "}
            {busy ? "Generating PDF…" : "Download PDF"}
          </button>
        </div>
      </div>
      <div className="quotation-live-preview__notice" id={noteId}>
        {draft ? (
          <>
            <strong>DRAFT / NOT ISSUED</strong>
            <span>
              Previewing current edits. Review incomplete details before
              issuing. Closing returns to the same editing step.
            </span>
          </>
        ) : (
          <>
            <strong>{quotation.status}</strong>
            <span>Viewing the existing quotation document.</span>
          </>
        )}
      </div>
      {(document.error || actionError) && (
        <p className="quotation-live-preview__error" role="alert">
          {document.error
            ? "Could not generate the quotation preview. " +
              document.error +
              " Close the preview and check your quotation values."
            : actionError}
        </p>
      )}
      <div
        ref={viewport}
        className={
          "quotation-live-preview__viewport" + (zoom === "fit" ? " is-fit" : "")
        }
        tabIndex={0}
        role="region"
        aria-label="Quotation document pages"
        style={
          {
            "--quotation-preview-page-width": `${(794 * Number(zoom === "fit" ? 100 : zoom)) / 100}px`,
          } as React.CSSProperties
        }
      >
        <div className="quotation-live-preview__pages">
          {document.pages.map((svg, index) => (
            <figure key={index} className="quotation-live-preview__page">
              <figcaption>
                Page {index + 1} of {document.pages.length}
              </figcaption>
              <div
                className="quotation-live-preview__sheet"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </figure>
          ))}
        </div>
      </div>
    </dialog>
  );
}
