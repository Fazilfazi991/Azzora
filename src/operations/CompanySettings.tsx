import { useState } from "react";
import { useStore } from "../store";
import { Field } from "../components/ui";
import { Attachments } from "../components/uploads";
import { getOperations } from "./migration";
import { saveSettings } from "./repository";
export function CompanySettings() {
  const { db, mutate } = useStore();
  const [s, setS] = useState(() => structuredClone(getOperations(db).settings)),
    [invoiceNext, setInvoiceNext] = useState(db.commercialNumbering.invoice);
  return (
    <section className="panel">
      <h2>Company & Financial Settings</h2>
      <p className="muted">
        Browser-local demo configuration. Issued/approved records preserve
        historical company and monetary snapshots.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutate((d) => {
            if (!Number.isSafeInteger(invoiceNext) || invoiceNext < 1)
              throw Error("Check invoice sequence.");
            saveSettings(
              d,
              s,
              db.people.find((p) => p.status !== "Inactive")?.id || "",
            );
            d.commercialNumbering.invoice = invoiceNext;
          });
        }}
      >
        <details open>
          <summary>Company profile</summary>
          <div className="form-grid">
            {(
              [
                ["name", "Company name"],
                ["tradingName", "Trading name"],
                ["location", "Company address"],
                ["phone", "Company phone"],
                ["email", "Company email"],
                ["website", "Company website"],
                ["trn", "Company TRN"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  required={key === "name"}
                  type={key === "email" ? "email" : "text"}
                  value={s.company[key]}
                  onChange={(e) =>
                    setS({
                      ...s,
                      company: { ...s.company, [key]: e.target.value },
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <Field label="Company bank details (demo only)">
            <textarea
              value={s.company.bank}
              onChange={(e) =>
                setS({ ...s, company: { ...s.company, bank: e.target.value } })
              }
            />
          </Field>
          <Field label="Default invoice terms">
            <textarea
              value={s.company.invoiceTerms}
              onChange={(e) =>
                setS({
                  ...s,
                  company: { ...s.company, invoiceTerms: e.target.value },
                })
              }
            />
          </Field>
          <p>Company logo (PNG or JPEG)</p>
          <Attachments
            files={[]}
            onChange={(files) => {
              const f = files[0];
              if (!f || !["image/png", "image/jpeg"].includes(f.type)) {
                mutate(() => {
                  throw Error("Use a PNG/JPEG company logo.");
                });
                return;
              }
              setS({ ...s, company: { ...s.company, logo: f.dataUrl! } });
            }}
          />
          <img
            src={s.company.logo}
            alt="Company logo preview"
            className="company-logo-preview"
          />
        </details>
        <details>
          <summary>VAT, numbering and closure policy</summary>
          <div className="form-grid">
            <Field label="Default currency">
              <input value="AED" readOnly />
            </Field>
            <Field label="Default VAT percentage">
              <input
                required
                inputMode="decimal"
                value={s.vatPercentage}
                onChange={(e) => setS({ ...s, vatPercentage: e.target.value })}
              />
            </Field>
            <Field label="Default tax treatment">
              <select
                value={s.tax}
                onChange={(e) =>
                  setS({ ...s, tax: e.target.value as typeof s.tax })
                }
              >
                {["Exclusive", "Inclusive", "Zero Rated", "Exempt"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Default payment terms days">
              <input
                type="number"
                min="0"
                required
                value={s.paymentDays}
                onChange={(e) =>
                  setS({ ...s, paymentDays: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Financial year start (MM-DD)">
              <input
                required
                value={s.fiscalYearStart}
                onChange={(e) =>
                  setS({ ...s, fiscalYearStart: e.target.value })
                }
              />
            </Field>
            <Field label="Retention allowance percentage">
              <input
                inputMode="decimal"
                value={s.retentionPercentage}
                onChange={(e) =>
                  setS({ ...s, retentionPercentage: e.target.value })
                }
              />
            </Field>
            <Field label="Invoice prefix">
              <input
                required
                value={s.invoicePrefix}
                onChange={(e) => setS({ ...s, invoicePrefix: e.target.value })}
              />
            </Field>
            <Field label="Next invoice sequence">
              <input
                type="number"
                min="1"
                value={invoiceNext}
                onChange={(e) => setInvoiceNext(Number(e.target.value))}
              />
            </Field>
            {(["variation", "po", "credit"] as const).flatMap((key) => [
              <Field label={`${key} number prefix`} key={key + "prefix"}>
                <input
                  required
                  value={s.numbering[key].prefix}
                  onChange={(e) =>
                    setS({
                      ...s,
                      numbering: {
                        ...s.numbering,
                        [key]: { ...s.numbering[key], prefix: e.target.value },
                      },
                    })
                  }
                />
              </Field>,
              <Field label={`${key} next number`} key={key + "next"}>
                <input
                  type="number"
                  min="1"
                  required
                  value={s.numbering[key].next}
                  onChange={(e) =>
                    setS({
                      ...s,
                      numbering: {
                        ...s.numbering,
                        [key]: {
                          ...s.numbering[key],
                          next: Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </Field>,
            ])}
          </div>
          <label className="choice">
            <input
              type="checkbox"
              checked={s.blockOperationalForFinance}
              onChange={(e) =>
                setS({ ...s, blockOperationalForFinance: e.target.checked })
              }
            />
            Block operational handover until commercial obligations are clear
          </label>
          <p className="muted">
            Off by default. Retention is an estimated allowance, not a release
            subledger. Documents are demo commercial documents without legal tax
            certification.
          </p>
        </details>
        <button className="primary">Save Company & Financial Settings</button>
      </form>
    </section>
  );
}
