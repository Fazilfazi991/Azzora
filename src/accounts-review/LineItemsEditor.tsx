import { useId } from "react";
import type { ReferenceCatalog } from "./documents/model";
import {
  blankReviewLine,
  calculateItemLines,
  comparableCatalogPrice,
  MAX_REVIEW_LINES,
  reviewFilsToDecimal,
  type ReviewLineInput,
} from "./item-lines";
import "./item-lines.css";

export interface LineItemsEditorProps {
  items: ReviewLineInput[];
  onChange: (items: ReviewLineInput[]) => void;
  supplier?: string;
  products?: ReferenceCatalog["products"];
  readOnly?: boolean;
}

export function LineItemsEditor({
  items,
  onChange,
  supplier = "",
  products = [],
  readOnly = false,
}: LineItemsEditorProps) {
  const id = useId();
  const update = (index: number, change: Partial<ReviewLineInput>) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...change } : item)),
    );
  let subtotal: string | undefined;
  let error = "";
  try {
    subtotal = calculateItemLines(items).subtotalFils;
  } catch (failure) {
    error =
      failure instanceof Error
        ? failure.message
        : "Complete each item to calculate the subtotal.";
  }
  return (
    <section className="review-item-editor" aria-labelledby={`${id}-heading`}>
      <div className="review-item-heading">
        <h3 id={`${id}-heading`}>Items</h3>
        <span>Amounts in AED</span>
      </div>
      <p className="review-item-scroll-hint" id={`${id}-hint`}>
        Scroll the item table sideways on smaller screens. Quantity and rate
        accept up to four decimal places.
      </p>
      <div
        className="review-item-scroll"
        role="region"
        aria-label="Editable document items"
        aria-describedby={`${id}-hint`}
        tabIndex={0}
      >
        <table className="review-item-table">
          <caption className="sr-only">
            Document items, calculated amounts and subtotal
          </caption>
          <thead>
            <tr>
              <th scope="col">Item / Description</th>
              <th scope="col">Quantity</th>
              <th scope="col">Unit</th>
              <th scope="col">Rate</th>
              <th scope="col">Amount</th>
              {!readOnly && (
                <th scope="col">
                  <span className="sr-only">Remove item</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              let amount: string | undefined;
              try {
                amount = calculateItemLines([item]).subtotalFils;
              } catch {
                /* Incomplete rows stay editable. */
              }
              const notice = comparableCatalogPrice(item, supplier, products);
              return (
                <tr key={index}>
                  <td className="review-item-description">
                    <textarea
                      aria-label={`Item ${index + 1} description`}
                      value={item.description}
                      maxLength={500}
                      rows={2}
                      readOnly={readOnly}
                      onChange={(event) =>
                        update(index, {
                          description: event.target.value,
                          productId: undefined,
                        })
                      }
                      placeholder="Describe the item or service"
                    />
                    {products.length > 0 && !readOnly && (
                      <select
                        aria-label={`Item ${index + 1} product`}
                        value={item.productId ?? ""}
                        onChange={(event) => {
                          const product = products.find(
                            (candidate) => candidate.id === event.target.value,
                          );
                          update(
                            index,
                            product
                              ? {
                                  productId: product.id,
                                  description: product.name,
                                  unit: product.unit,
                                  ...(!item.rate ? { rate: product.rate } : {}),
                                }
                              : { productId: undefined },
                          );
                        }}
                      >
                        <option value="">
                          Custom item · match product if available
                        </option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} · {product.unit} · {product.supplier}
                          </option>
                        ))}
                      </select>
                    )}
                    <details className="review-item-details">
                      <summary>
                        Measurement / details
                        {item.details ? " · added" : " (optional)"}
                      </summary>
                      <textarea
                        aria-label={`Item ${index + 1} measurement or details`}
                        value={item.details ?? ""}
                        maxLength={1000}
                        rows={2}
                        readOnly={readOnly}
                        onChange={(event) =>
                          update(index, { details: event.target.value })
                        }
                        placeholder="Optional weight, size or reference; does not change calculations"
                      />
                    </details>
                    {notice && (
                      <p className="review-item-price-notice">
                        Rate{" "}
                        {notice.direction === "increase" ? "above" : "below"}{" "}
                        matching supplier/unit catalog reference: AED{" "}
                        {notice.referenceRate}. Current: AED{" "}
                        {notice.currentRate}. Catalog reference only; purchase
                        history is not verified here.
                      </p>
                    )}
                  </td>
                  <td>
                    <input
                      aria-label={`Item ${index + 1} quantity`}
                      inputMode="decimal"
                      value={item.quantity}
                      maxLength={23}
                      readOnly={readOnly}
                      onChange={(event) =>
                        update(index, { quantity: event.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Item ${index + 1} unit`}
                      value={item.unit}
                      maxLength={40}
                      readOnly={readOnly}
                      onChange={(event) =>
                        update(index, { unit: event.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Item ${index + 1} rate`}
                      inputMode="decimal"
                      value={item.rate}
                      maxLength={23}
                      readOnly={readOnly}
                      onChange={(event) =>
                        update(index, { rate: event.target.value })
                      }
                      placeholder="0.00"
                    />
                  </td>
                  <td className="review-item-amount">
                    <output aria-label={`Item ${index + 1} amount`}>
                      {amount === undefined ? "—" : reviewFilsToDecimal(amount)}
                    </output>
                  </td>
                  {!readOnly && (
                    <td>
                      <button
                        className="review-item-remove"
                        type="button"
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() =>
                          onChange(items.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="review-item-footer">
        {!readOnly && (
          <button
            className="button button-secondary"
            type="button"
            disabled={items.length >= MAX_REVIEW_LINES}
            onClick={() => onChange([...items, blankReviewLine()])}
          >
            + Add Item
          </button>
        )}
        <div className="review-item-subtotal">
          <span>Subtotal</span>
          <output aria-label="Item subtotal">
            {subtotal === undefined
              ? "—"
              : `AED ${reviewFilsToDecimal(subtotal)}`}
          </output>
        </div>
      </div>
      {error && (
        <p className="review-item-validation" role="status">
          {error}
        </p>
      )}
      {items.length >= MAX_REVIEW_LINES && !readOnly && (
        <p className="review-item-validation">
          Maximum {MAX_REVIEW_LINES} items per document.
        </p>
      )}
    </section>
  );
}
