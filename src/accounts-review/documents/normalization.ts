import {
  blankFields,
  fieldsSchema,
  itemSchema,
  type EntryFields,
} from "./model.js";
export interface FieldIssue {
  field: string;
  reason: string;
  original?: string;
}
const identifiers = new Set([
  "categoryId",
  "projectId",
  "customerId",
  "ledgerId",
  "productId",
]);
const money = new Set(["subtotal", "discount", "tax", "total", "unitRate"]);
const words = (v: unknown) =>
  typeof v === "string"
    ? v.trim()
    : typeof v === "number" && Number.isFinite(v)
      ? String(v)
      : v;
function digits(s: string) {
  return s
    .replace(/[٠-٩۰-۹]/g, (c) =>
      String(
        c.charCodeAt(0) > 1775
          ? c.charCodeAt(0) - 1776
          : c.charCodeAt(0) - 1632,
      ),
    )
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}
function formatted(v: unknown, key: string): unknown {
  if (v === null || v === undefined)
    return key === "documentType" || key === "kind"
      ? "unknown"
      : key === "currency"
        ? "unknown"
        : "";
  if (typeof v === "number")
    return Number.isFinite(v) && v >= 0 ? String(v) : v;
  if (typeof v !== "string") return v;
  let s = digits(v.trim());
  if (money.has(key) || key === "quantity") {
    s = s
      .replace(/^(?:AED|DHS?|د\.إ)\s*/i, "")
      .replace(/\s*(?:AED|DHS?|د\.إ)$/i, "");
    if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  }
  if (["date", "dueDate"].includes(key)) {
    const iso = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
    if (iso)
      s = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  if (key === "currency") {
    if (/^(AED|DHS?|د\.إ|درهم)$/i.test(s)) return "AED";
    if (!s) return "unknown";
    if (/^(USD|EUR|GBP|SAR|INR)$/i.test(s)) return "other";
  }
  if (key === "documentType") s = s.toLowerCase();
  return s;
}
/** Only normalize independent evidence fields. No arithmetic repair or matching IDs. */
export function normalizeExtractionContent(content: unknown): {
  fields: EntryFields;
  uncertain: string[];
  completeness: "complete" | "partial";
  fieldIssues: FieldIssue[];
  reviewOnly?: boolean;
} {
  if (!content || typeof content !== "object" || Array.isArray(content))
    throw Error("AI response has no document fields.");
  const root = content as Record<string, unknown>;
  const raw =
    root.fields &&
    typeof root.fields === "object" &&
    !Array.isArray(root.fields)
      ? (root.fields as Record<string, unknown>)
      : root;
  const fields = blankFields(),
    uncertain = new Set<string>(),
    issues: FieldIssue[] = [];
  if (Array.isArray(root.uncertain))
    for (const p of root.uncertain)
      if (
        typeof p === "string" &&
        p.length <= 100 &&
        /^(?:[A-Za-z]+|items\.\d+(?:\.[A-Za-z]+)?)$/.test(p)
      )
        uncertain.add(p);
  const issue = (field: string, value: unknown, reason: string) => {
    uncertain.add(field);
    issues.push({
      field,
      reason,
      ...(value !== null && value !== undefined
        ? { original: String(words(value)).slice(0, 200) }
        : {}),
    });
  };
  for (const key of Object.keys(fieldsSchema.shape) as (keyof EntryFields)[]) {
    if (key === "items") continue;
    const value = raw[key];
    if (identifiers.has(key)) {
      if (value !== undefined && value !== null && value !== "")
        issue(
          key,
          value,
          "Unverified identifier removed; select an existing authorized record.",
        );
      (fields as unknown as Record<string, unknown>)[key] = "";
      continue;
    }
    const normalized = formatted(value, key),
      result = fieldsSchema.shape[key].safeParse(normalized);
    if (result.success) {
      (fields as unknown as Record<string, unknown>)[key] = result.data;
      if (
        value === null ||
        value === undefined ||
        result.data === "" ||
        result.data === "unknown"
      )
        uncertain.add(key);
    } else
      issue(
        key,
        value,
        "Invalid or ambiguous value; compare with the original document.",
      );
  }
  let reviewOnly = false;
  if (!Array.isArray(raw.items)) {
    issue("items", raw.items, "Item rows were not returned as a valid list.");
  } else {
    if (raw.items.length > 80) {
      issue(
        "items",
        raw.items.length,
        "More than80 item rows were returned. Only80 can be reviewed here; split the document.",
      );
      reviewOnly = true;
    }
    fields.items = raw.items.slice(0, 80).map((value, index) => {
      const row =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      const item: Record<string, unknown> = {};
      for (const key of Object.keys(
        itemSchema.shape,
      ) as (keyof typeof itemSchema.shape)[]) {
        const original = row[key],
          normalized = identifiers.has(key) ? "" : formatted(original, key);
        const result = itemSchema.shape[key].safeParse(normalized),
          path = `items.${index}.${key}`;
        if (result.success) {
          item[key] = result.data;
          if (
            !identifiers.has(key) &&
            (original === null || original === undefined || result.data === "")
          )
            uncertain.add(path);
        } else {
          item[key] = "";
          issue(
            path,
            original,
            "Invalid item value; compare with the original document.",
          );
        }
        if (
          identifiers.has(key) &&
          original !== null &&
          original !== undefined &&
          original !== ""
        )
          issue(path, original, "Unverified product identifier removed.");
      }
      return itemSchema.parse(item);
    });
    if (!fields.items.length) uncertain.add("items");
  }
  if (
    !fields.supplier &&
    !fields.reference &&
    !fields.date &&
    !fields.items.some((i) => i.description) &&
    !fields.total
  )
    throw Error("AI returned no usable extracted document information.");
  return {
    fields: fieldsSchema.parse(fields),
    uncertain: [...uncertain],
    completeness: uncertain.size ? "partial" : "complete",
    fieldIssues: issues,
    ...(reviewOnly ? { reviewOnly: true } : {}),
  };
}
