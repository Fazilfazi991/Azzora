import { useEffect, useId, useRef, type ReactNode } from "react";
import "./quotation-ux.css";

export const stepLabels = [
  "Customer & Project",
  "Scope of Work / BOQ",
  "Pricing Summary",
  "Payment Schedule & Terms",
  "Preview & Issue",
] as const;

const compactLabels = ["Customer", "Scope", "Pricing", "Payments", "Preview"];
const stepHelp = [
  "Choose who the quotation is for and where the work will happen.",
  "Start with a work category, then describe each item and add its quantity and rate.",
  "Review the calculated totals. Update item prices in the BOQ and check any discount or VAT adjustments.",
  "Set when payments are due and review the terms your customer will receive.",
  "Check the finished quotation before you finalize and share it with your customer.",
] as const;

/** Controlled presentation frame. The parent owns content, validation and lifecycle. */
export function QuotationGuide({
  step,
  onStepChange,
  children,
}: {
  step: number;
  onStepChange: (step: number) => void;
  children: ReactNode;
}) {
  const currentStep =
    Number.isInteger(step) && step >= 0 && step < stepLabels.length ? step : 0;
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(currentStep);
  const headingId = useId();
  const helpId = useId();

  useEffect(() => {
    if (previousStep.current !== currentStep) {
      previousStep.current = currentStep;
      heading.current?.focus();
    }
  }, [currentStep]);

  return (
    <div className="quotation-guide">
      <nav className="quotation-guide__nav" aria-label="Quotation steps">
        <ol className="quotation-guide__steps">
          {stepLabels.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                className="quotation-guide__step"
                aria-label={label}
                aria-current={currentStep === index ? "step" : undefined}
                onClick={() => onStepChange(index)}
              >
                <span className="quotation-guide__number" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="quotation-guide__step-label">{label}</span>
                <span
                  className="quotation-guide__compact-label"
                  aria-hidden="true"
                >
                  {compactLabels[index]}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <header className="quotation-guide__heading">
        <p className="quotation-guide__position">
          Step {currentStep + 1} of {stepLabels.length}
        </p>
        <h2
          ref={heading}
          id={headingId}
          tabIndex={-1}
          aria-describedby={helpId}
        >
          {stepLabels[currentStep]}
        </h2>
        <p id={helpId} className="quotation-context-help">
          {stepHelp[currentStep]}
        </p>
      </header>

      <div
        className="quotation-step-panel"
        role="region"
        aria-labelledby={headingId}
      >
        {children}
      </div>
    </div>
  );
}
