import type { Quotation, QuotationLineItem, QuotationSection } from "./model";
import { blankLine } from "./repository";
import { lineAmount } from "./calculations";
import { uid } from "../domain/logic";

export interface BoqNode {
  row: QuotationLineItem;
  depth: number;
  children: BoqNode[];
}
export type BoqCreation<T> = { quotation: Quotation } & T;

/** Presentation traversal only: never infer identity or parentage from visible numbers. */
export function boqTree(section: QuotationSection): BoqNode[] {
  const ids = new Set(section.rows.map((row) => row.id));
  if (ids.size !== section.rows.length || ids.has(""))
    throw Error("BOQ row IDs must be unique and non-empty.");
  const siblings = new Map<string | undefined, QuotationLineItem[]>();
  for (const row of section.rows) {
    if (row.parentId && !ids.has(row.parentId))
      throw Error("BOQ parent must belong to the same category.");
    const key = row.parentId || undefined;
    siblings.set(key, [...(siblings.get(key) || []), row]);
  }
  let visited = 0;
  const walk = (parentId: string | undefined, depth: number): BoqNode[] =>
    (siblings.get(parentId) || []).map((row) => {
      visited++;
      return { row, depth, children: walk(row.id, depth + 1) };
    });
  const roots = walk(undefined, 0);
  if (visited !== section.rows.length)
    throw Error("BOQ parent relationships must not contain a cycle.");
  return roots;
}
const flatten = (nodes: BoqNode[]): QuotationLineItem[] =>
  nodes.flatMap((node) => [node.row, ...flatten(node.children)]);
const findNode = (nodes: BoqNode[], id: string): BoqNode | undefined => {
  for (const node of nodes) {
    if (node.row.id === id) return node;
    const child = findNode(node.children, id);
    if (child) return child;
  }
};
const sectionAt = (q: Quotation, id: string) => {
  const section = q.sections.find((s) => s.id === id);
  if (!section) throw Error("Work category not found.");
  return section;
};
const nodeAt = (section: QuotationSection, id: string) => {
  const node = findNode(boqTree(section), id);
  if (!node) throw Error("BOQ item not found.");
  return node;
};
/** Includes every priced descendant exactly once, using the unchanged financial engine. */
export function boqGroupAmount(
  section: QuotationSection,
  rowId: string,
): bigint {
  return flatten([nodeAt(section, rowId)]).reduce(
    (sum, row) => sum + lineAmount(row),
    0n,
  );
}

/** Existing reference/revision/previously-issued numbering is always preserved. */
export function numberingMode(q: Quotation): "automatic" | "preserve" {
  return q.status === "Draft" &&
    !q.finalizedAt &&
    !q.revisionDetails.sourceId &&
    q.id !== "quotation-reference" &&
    q.familyId !== "quotation-reference" &&
    !q.history.some((h) => h.action === "Reference imported" || h.snapshot)
    ? "automatic"
    : "preserve";
}
function validate(q: Quotation) {
  const ids = new Set<string>();
  for (const section of q.sections) {
    if (!section.id || ids.has(section.id))
      throw Error("Work category IDs must be unique.");
    ids.add(section.id);
    boqTree(section);
    for (const row of section.rows) {
      if (ids.has(row.id))
        throw Error("BOQ IDs must be unique across categories.");
      ids.add(row.id);
    }
  }
  for (const section of q.sections) {
    const path = new Set([section.id]);
    let parentId = section.parentId;
    while (parentId) {
      if (path.has(parentId))
        throw Error("Work category parents must not contain a cycle.");
      path.add(parentId);
      const parent = q.sections.find((s) => s.id === parentId);
      if (!parent) throw Error("Parent work category not found.");
      parentId = parent.parentId;
    }
  }
}
function draftCopy(q: Quotation): Quotation {
  if (q.status !== "Draft")
    throw Error(
      "Issued quotations are immutable. Create a draft revision to change BOQ structure.",
    );
  validate(q);
  return structuredClone(q);
}
const numbers = (q: Quotation) =>
  new Set(
    q.sections.flatMap((s) => [
      s.number.replace(/\.00$/, ""),
      ...s.rows.map((r) => r.number),
    ]),
  );
function nextNumber(prefix: string, used: Set<string>): string {
  const stem = prefix ? prefix + "." : "";
  let ordinal = 0;
  for (const number of used) {
    if (!number.startsWith(stem)) continue;
    const part = number.slice(stem.length).split(".")[0];
    if (/^\d+$/.test(part)) ordinal = Math.max(ordinal, Number(part));
  }
  let number: string;
  do {
    number = stem + String(++ordinal);
  } while (used.has(number));
  used.add(number);
  return number;
}
/** Rows and subcategories share their parent's child slots, so numbers never collide. */
export function renumberBoq(q: Quotation): Quotation {
  const next = structuredClone(q);
  if (numberingMode(q) === "preserve") return next;
  validate(next);
  const categories = new Map<string | undefined, QuotationSection[]>();
  for (const section of next.sections) {
    const parent = section.parentId || undefined;
    categories.set(parent, [...(categories.get(parent) || []), section]);
  }
  const ordered: QuotationSection[] = [];
  const numberCategories = (
    parentId: string | undefined,
    prefix: string,
    rowSlots = 0,
  ) =>
    (categories.get(parentId) || []).forEach((section, index) => {
      section.number = prefix
        ? prefix + "." + String(rowSlots + index + 1)
        : String(index + 1);
      const tree = boqTree(section);
      const numberRows = (nodes: BoqNode[], prefix: string) =>
        nodes.forEach((node, i) => {
          node.row.number = prefix + "." + String(i + 1);
          numberRows(node.children, node.row.number);
        });
      numberRows(tree, section.number);
      section.rows = flatten(tree);
      ordered.push(section);
      numberCategories(section.id, section.number, tree.length);
    });
  numberCategories(undefined, "");
  next.sections = ordered;
  return next;
}
function finish(q: Quotation) {
  return renumberBoq(q);
}
function categoryGroup(q: Quotation, id: string): Set<string> {
  sectionAt(q, id);
  const group = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const section of q.sections)
      if (
        section.parentId &&
        group.has(section.parentId) &&
        !group.has(section.id)
      ) {
        group.add(section.id);
        changed = true;
      }
  }
  return group;
}
const allIds = (q: Quotation) =>
  new Set(q.sections.flatMap((s) => [s.id, ...s.rows.map((r) => r.id)]));
function reserveId(ids: Set<string>): string {
  let id = uid();
  while (ids.has(id)) id = uid();
  ids.add(id);
  return id;
}
const newId = (q: Quotation) => reserveId(allIds(q));
export function addBoqCategory(
  q: Quotation,
  options: { title?: string; parentId?: string } = {},
): BoqCreation<{ categoryId: string }> {
  const next = draftCopy(q),
    parent = options.parentId ? sectionAt(next, options.parentId) : undefined;
  const categoryId = newId(next);
  const section: QuotationSection = {
    id: categoryId,
    number: nextNumber(
      parent?.number.replace(/\.00$/, "") || "",
      numbers(next),
    ),
    title: options.title || (parent ? "New subcategory" : "New work category"),
    rows: [],
  };
  if (parent) section.parentId = parent.id;
  const group = parent ? categoryGroup(next, parent.id) : undefined;
  const index = group
    ? Math.max(...next.sections.map((s, i) => (group.has(s.id) ? i : -1))) + 1
    : next.sections.length;
  next.sections.splice(index, 0, section);
  return { quotation: finish(next), categoryId };
}
export function addBoqRow(
  q: Quotation,
  sectionId: string,
  options: { kind: "heading" | "priced"; parentId?: string },
): BoqCreation<{ rowId: string }> {
  const next = draftCopy(q),
    section = sectionAt(next, sectionId),
    parent = options.parentId ? nodeAt(section, options.parentId) : undefined;
  if (parent && parent.row.pricingType !== "Heading")
    throw Error(
      "Use a Heading (No Price) parent before adding child items; an existing billable parent must be changed explicitly.",
    );
  const row = blankLine(
    nextNumber(
      parent?.row.number || section.number.replace(/\.00$/, ""),
      numbers(next),
    ),
    parent?.row.id,
  );
  row.id = newId(next);
  if (options.kind === "heading")
    Object.assign(row, {
      pricingType: "Heading",
      quantity: "",
      rate: "",
      unit: "",
    });
  const group = parent
    ? new Set(flatten([parent]).map((r) => r.id))
    : undefined;
  const index = group
    ? Math.max(...section.rows.map((r, i) => (group.has(r.id) ? i : -1))) + 1
    : section.rows.length;
  section.rows.splice(index, 0, row);
  return { quotation: finish(next), rowId: row.id };
}
export function deleteBoqRow(
  q: Quotation,
  sectionId: string,
  rowId: string,
): Quotation {
  const next = draftCopy(q),
    section = sectionAt(next, sectionId),
    ids = new Set(flatten([nodeAt(section, rowId)]).map((r) => r.id));
  section.rows = section.rows.filter((r) => !ids.has(r.id));
  return finish(next);
}
export function duplicateBoqRow(
  q: Quotation,
  sectionId: string,
  rowId: string,
): BoqCreation<{ rowId: string }> {
  const next = draftCopy(q),
    section = sectionAt(next, sectionId),
    group = flatten([nodeAt(section, rowId)]),
    ids = new Map<string, string>(),
    used = numbers(next);
  const reserved = allIds(next);
  for (const row of group) ids.set(row.id, reserveId(reserved));
  const assigned = new Map<string, string>();
  const copies = group.map((row, index) => {
    const parentId = row.parentId
      ? ids.get(row.parentId) || row.parentId
      : undefined;
    const prefix =
      index === 0
        ? row.parentId
          ? nodeAt(section, row.parentId).row.number
          : section.number.replace(/\.00$/, "")
        : assigned.get(row.parentId!)!;
    const number = nextNumber(prefix, used);
    assigned.set(row.id, number);
    return { ...structuredClone(row), id: ids.get(row.id)!, parentId, number };
  });
  const originalIds = new Set(group.map((r) => r.id));
  const index =
    Math.max(...section.rows.map((r, i) => (originalIds.has(r.id) ? i : -1))) +
    1;
  section.rows.splice(index, 0, ...copies);
  return { quotation: finish(next), rowId: copies[0].id };
}
export function moveBoqRow(
  q: Quotation,
  sectionId: string,
  rowId: string,
  direction: -1 | 1,
): Quotation {
  const next = draftCopy(q),
    section = sectionAt(next, sectionId),
    tree = boqTree(section),
    selected = nodeAt(section, rowId);
  const siblings = selected.row.parentId
    ? findNode(tree, selected.row.parentId)!.children
    : tree;
  const index = siblings.findIndex((node) => node.row.id === rowId),
    target = index + direction;
  if (target < 0 || target >= siblings.length) return next;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  section.rows = flatten(tree);
  return finish(next);
}
export function deleteBoqCategory(q: Quotation, categoryId: string): Quotation {
  const next = draftCopy(q),
    ids = categoryGroup(next, categoryId);
  next.sections = next.sections.filter((s) => !ids.has(s.id));
  return finish(next);
}
export function duplicateBoqCategory(
  q: Quotation,
  categoryId: string,
): BoqCreation<{ categoryId: string }> {
  const next = draftCopy(q),
    groupIds = categoryGroup(next, categoryId),
    group = next.sections.filter((s) => groupIds.has(s.id)),
    used = numbers(next),
    ids = new Map<string, string>();
  // Reserve all newly generated IDs across sections and rows.
  const reserved = new Set(
    next.sections.flatMap((s) => [s.id, ...s.rows.map((r) => r.id)]),
  );
  for (const section of group)
    for (const oldId of [section.id, ...section.rows.map((r) => r.id)]) {
      let id = uid();
      while (reserved.has(id)) id = uid();
      reserved.add(id);
      ids.set(oldId, id);
    }
  const copies = group.map((section) => {
    const copy = structuredClone(section);
    copy.id = ids.get(section.id)!;
    if (copy.parentId) copy.parentId = ids.get(copy.parentId) || copy.parentId;
    copy.number = nextNumber("", used);
    const assigned = new Map<string, string>();
    copy.rows = flatten(boqTree(section)).map((row) => {
      const number = nextNumber(
        row.parentId ? assigned.get(row.parentId)! : copy.number,
        used,
      );
      assigned.set(row.id, number);
      return {
        ...structuredClone(row),
        id: ids.get(row.id)!,
        parentId: row.parentId ? ids.get(row.parentId) : undefined,
        number,
      };
    });
    return copy;
  });
  const index =
    Math.max(...next.sections.map((s, i) => (groupIds.has(s.id) ? i : -1))) + 1;
  next.sections.splice(index, 0, ...copies);
  return { quotation: finish(next), categoryId: ids.get(categoryId)! };
}
export function moveBoqCategory(
  q: Quotation,
  categoryId: string,
  direction: -1 | 1,
): Quotation {
  const next = draftCopy(q),
    section = sectionAt(next, categoryId),
    siblings = next.sections.filter((s) => s.parentId === section.parentId),
    index = siblings.findIndex((s) => s.id === categoryId),
    target = siblings[index + direction];
  if (!target) return next;
  const group = categoryGroup(next, categoryId),
    targetGroup = categoryGroup(next, target.id),
    moving = next.sections.filter((s) => group.has(s.id)),
    rest = next.sections.filter((s) => !group.has(s.id));
  const positions = rest
      .map((s, i) => (targetGroup.has(s.id) ? i : -1))
      .filter((i) => i >= 0),
    insert =
      direction === -1 ? Math.min(...positions) : Math.max(...positions) + 1;
  rest.splice(insert, 0, ...moving);
  next.sections = rest;
  return finish(next);
}
/** Reparent an entire row group; never orphan descendants or silently remove a charge. */
export function setBoqRowParent(
  q: Quotation,
  sectionId: string,
  rowId: string,
  parentId?: string,
): Quotation {
  const next = draftCopy(q),
    section = sectionAt(next, sectionId),
    node = nodeAt(section, rowId),
    group = flatten([node]),
    ids = new Set(group.map((r) => r.id));
  if ((node.row.parentId || undefined) === (parentId || undefined)) return next;
  if (parentId && ids.has(parentId))
    throw Error("An item cannot be parented to itself or its descendants.");
  const parent = parentId ? nodeAt(section, parentId) : undefined;
  if (parent && parent.row.pricingType !== "Heading")
    throw Error(
      "Use a Heading (No Price) parent before attaching child items.",
    );
  section.rows = section.rows.filter((r) => !ids.has(r.id));
  if (parentId) node.row.parentId = parentId;
  else delete node.row.parentId;
  const targetIds = parentId
    ? new Set(flatten([nodeAt(section, parentId)]).map((r) => r.id))
    : undefined;
  const insert = targetIds
    ? Math.max(...section.rows.map((r, i) => (targetIds.has(r.id) ? i : -1))) +
      1
    : section.rows.length;
  section.rows.splice(insert, 0, ...group);
  return finish(next);
}
export function setBoqCategoryParent(
  q: Quotation,
  categoryId: string,
  parentId?: string,
): Quotation {
  const next = draftCopy(q),
    section = sectionAt(next, categoryId),
    ids = categoryGroup(next, categoryId);
  if ((section.parentId || undefined) === (parentId || undefined)) return next;
  if (parentId && ids.has(parentId))
    throw Error("A category cannot be parented to itself or its descendants.");
  if (parentId) sectionAt(next, parentId);
  const moving = next.sections.filter((s) => ids.has(s.id));
  next.sections = next.sections.filter((s) => !ids.has(s.id));
  if (parentId) section.parentId = parentId;
  else delete section.parentId;
  const targetIds = parentId ? categoryGroup(next, parentId) : undefined;
  const insert = targetIds
    ? Math.max(...next.sections.map((s, i) => (targetIds.has(s.id) ? i : -1))) +
      1
    : next.sections.length;
  next.sections.splice(insert, 0, ...moving);
  return finish(next);
}
