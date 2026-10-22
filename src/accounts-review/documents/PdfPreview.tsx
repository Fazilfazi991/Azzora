import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    setPdf(null);
    setPage(1);
    setError("");
    setReady(false);
    const task = getDocument({
      url,
      disableAutoFetch: true,
      disableStream: true,
    });
    task.promise
      .then((value) => {
        if (active) setPdf(value);
      })
      .catch(() => {
        if (active)
          setError(
            "This PDF could not be previewed. Open the original to review it.",
          );
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [url]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let active = true;
    let cancel: (() => void) | undefined;
    setReady(false);
    pdf
      .getPage(page)
      .then((p) => {
        if (!active || !canvas.current) return;
        const original = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({
            scale: Math.min(1.5, 1400 / original.width, 1800 / original.height),
          }),
          node = canvas.current;
        node.width = viewport.width;
        node.height = viewport.height;
        const task = p.render({ canvas: node, viewport });
        cancel = () => task.cancel();
        task.promise
          .then(() => {
            if (active) setReady(true);
          })
          .catch((e) => {
            if (active && e.name !== "RenderingCancelledException")
              setError(
                "PDF page could not be rendered. Open the original to review it.",
              );
          });
      })
      .catch(() => {
        if (active) setError("PDF page is unavailable.");
      });
    return () => {
      active = false;
      cancel?.();
    };
  }, [pdf, page]);
  return (
    <div className="entry-pdf" aria-label="Original uploaded PDF">
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          {!ready && <p role="status">Rendering PDF…</p>}
          <canvas
            ref={canvas}
            aria-label={`Original PDF page ${page}`}
            data-rendered={ready}
            role="img"
          />
          <div className="entry-pdf-controls">
            <button
              type="button"
              className="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={!pdf || page <= 1}
            >
              Previous page
            </button>
            <span>
              Page {page} of {pdf?.numPages || "…"}
            </span>
            <button
              type="button"
              className="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!pdf || page >= pdf.numPages}
            >
              Next page
            </button>
          </div>
        </>
      )}
    </div>
  );
}
