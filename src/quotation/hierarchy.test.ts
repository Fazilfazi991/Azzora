import { describe, expect, it } from "vitest";
import type { Quotation } from "./model";
import { blankQuotation, referenceQuotation } from "./seed";
import { blankLine, saveQuotation, validationErrors } from "./repository";
import { lineAmount, totals } from "./calculations";
import { layoutQuotation } from "./document";
import { seed } from "../domain/seed";
import { initializeCommercial } from "../commercial/migration";
import { decodeSavedData } from "../domain/repository";
import {
  addBoqCategory,
  addBoqRow,
  boqTree,
  boqGroupAmount,
  deleteBoqCategory,
  deleteBoqRow,
  duplicateBoqCategory,
  duplicateBoqRow,
  displayBoqCategoryNumber,
  moveBoqCategory,
  moveBoqRow,
  isBoqParentDescription,
  numberingMode,
  renumberBoq,
  setBoqCategoryParent,
  setBoqRowParent,
} from "./hierarchy";

function scene() {
  let q = blankQuotation("QA-HIERARCHY");
  q = addBoqCategory(q, { title: "Preliminaries" }).quotation;
  const category = addBoqCategory(q, { title: "Painting Works" });
  q = category.quotation;
  const parent = addBoqRow(q, category.categoryId, { kind: "heading" });
  q = parent.quotation;
  q.sections[1].rows[0].description =
    "Supply and apply interior emulsion paint";
  const childIds: string[] = [];
  for (const [name, quantity] of [
    ["Living Room", "40"],
    ["Bedroom 1", "20"],
    ["Bedroom 2", "25"],
  ]) {
    const child = addBoqRow(q, category.categoryId, {
      kind: "priced",
      parentId: parent.rowId,
    });
    q = child.quotation;
    childIds.push(child.rowId);
    Object.assign(
      q.sections[1].rows.find((r) => r.id === child.rowId)!,
      { description: name, quantity, unit: "M2", rate: "35" },
    );
  }
  const second = addBoqRow(q, category.categoryId, { kind: "heading" });
  q = second.quotation;
  const ceiling = addBoqRow(q, category.categoryId, {
    kind: "priced",
    parentId: second.rowId,
  });
  q = ceiling.quotation;
  return {
    q,
    categoryId: category.categoryId,
    parentId: parent.rowId,
    secondId: second.rowId,
    childIds,
    ceilingId: ceiling.rowId,
  };
}
const rows = (q: Quotation, categoryId: string) =>
  q.sections.find((s) => s.id === categoryId)!.rows;
const ids = (q: Quotation) =>
  q.sections.flatMap((s) => [s.id, ...s.rows.map((r) => r.id)]);
const numbers = (q: Quotation) =>
  q.sections.flatMap((s) => [s.number, ...s.rows.map((r) => r.number)]);

describe("BOQ hierarchy commands and pricing integrity", () => {
  it("displays new top-level categories as 3.00 without changing stored paths", () => {
    let q = blankQuotation("QA-CATEGORY-NUMBER");
    const first = addBoqCategory(q, { title: "Preliminaries" });
    q = first.quotation;
    const second = addBoqCategory(q, { title: "Demolition" });
    q = second.quotation;
    const third = addBoqCategory(q, { title: "Tiling" });
    q = third.quotation;
    const nested = addBoqCategory(q, {
      title: "Wet Areas",
      parentId: third.categoryId,
    });
    q = nested.quotation;
    expect(q.sections.map((s) => s.number)).toEqual(["1", "2", "3", "3.1"]);
    expect(q.sections.map((s) => displayBoqCategoryNumber(q, s))).toEqual([
      "1.00",
      "2.00",
      "3.00",
      "3.1",
    ]);
    const reference = referenceQuotation();
    expect(
      reference.sections.map((s) => displayBoqCategoryNumber(reference, s)),
    ).toEqual(reference.sections.map((s) => s.number));
  });
  it("creates the requested 2.1.1–2.1.3 and 2.2.1 hierarchy with non-priced parents", () => {
    const { q, categoryId, parentId, childIds } = scene();
    expect(rows(q, categoryId).map((r) => r.number)).toEqual([
      "2.1",
      "2.1.1",
      "2.1.2",
      "2.1.3",
      "2.2",
      "2.2.1",
    ]);
    expect(rows(q, categoryId)[0]).toMatchObject({
      id: parentId,
      pricingType: "By Client",
      boqRole: "parent",
      quantity: "",
      rate: "",
    });
    expect(boqTree(q.sections[1])[0].children.map((n) => n.row.id)).toEqual(
      childIds,
    );
    expect(boqTree(q.sections[1])[0].children.map((n) => n.depth)).toEqual([
      1, 1, 1,
    ]);
  });
  it("keeps a new By Client parent distinct from a direct By Client row after persistence", () => {
    const q = blankQuotation("QA-PARENT-ROLE");
    const category = addBoqCategory(q, { title: "Demolition" });
    const parent = addBoqRow(category.quotation, category.categoryId, {
      kind: "heading",
    });
    const direct = addBoqRow(parent.quotation, category.categoryId, {
      kind: "priced",
    });
    const parentRow = rows(direct.quotation, category.categoryId).find(
      (r) => r.id === parent.rowId,
    )!;
    const directRow = rows(direct.quotation, category.categoryId).find(
      (r) => r.id === direct.rowId,
    )!;
    directRow.pricingType = "By Client";
    expect(parentRow).toMatchObject({
      pricingType: "By Client",
      boqRole: "parent",
    });
    expect(isBoqParentDescription(parentRow)).toBe(true);
    expect(isBoqParentDescription(directRow)).toBe(false);
    const db = seed();
    saveQuotation(db, direct.quotation);
    const loaded = decodeSavedData(JSON.stringify(db)).quotations.find(
      (saved) => saved.id === q.id,
    )!;
    expect(isBoqParentDescription(rows(loaded, category.categoryId)[0])).toBe(
      true,
    );
    const child = addBoqRow(loaded, category.categoryId, {
      kind: "priced",
      parentId: parent.rowId,
    });
    expect(
      rows(child.quotation, category.categoryId).find(
        (r) => r.id === child.rowId,
      ),
    ).toMatchObject({ parentId: parent.rowId, pricingType: "Normal Rate" });
  });
  it.each(["By Client", "FOC", "Excluded", "Heading"] as const)(
    "allows a %s parent with Normal Rate children but no parent charge",
    (pricingType) => {
      const q = blankQuotation("QA-CHILD-PRICE");
      const category = addBoqCategory(q, { title: "Works" });
      const parent = addBoqRow(category.quotation, category.categoryId, {
        kind: "heading",
      });
      const parentRow = rows(parent.quotation, category.categoryId)[0];
      Object.assign(parentRow, {
        pricingType,
        quantity: "10",
        unit: "M2",
        rate: "999",
        amountOverride: "9999",
      });
      const child = addBoqRow(parent.quotation, category.categoryId, {
        kind: "priced",
        parentId: parent.rowId,
      });
      const childRow = rows(child.quotation, category.categoryId).find(
        (r) => r.id === child.rowId,
      )!;
      Object.assign(childRow, { quantity: "8.4", unit: "M2", rate: "90" });
      expect(lineAmount(parentRow)).toBe(0n);
      expect(lineAmount(childRow)).toBe(75600n);
      expect(boqGroupAmount(child.quotation.sections[0], parent.rowId)).toBe(
        75600n,
      );
      expect(totals(child.quotation).subtotal).toBe(75600n);
    },
  );
  it("permits an intentional priced parent only while it has no children", () => {
    const q = blankQuotation("QA-PARENT-RATE");
    const category = addBoqCategory(q, { title: "Works" });
    const parent = addBoqRow(category.quotation, category.categoryId, {
      kind: "heading",
    });
    const parentRow = rows(parent.quotation, category.categoryId)[0];
    Object.assign(parentRow, {
      pricingType: "Normal Rate",
      quantity: "2",
      unit: "LS",
      rate: "100",
      description: "Direct work",
    });
    expect(lineAmount(parentRow)).toBe(20000n);
    expect(validationErrors(parent.quotation)).not.toContain(
      "Item 1.1: a priced parent cannot also contain child items.",
    );
    expect(() =>
      addBoqRow(parent.quotation, category.categoryId, {
        kind: "priced",
        parentId: parent.rowId,
      }),
    ).toThrow(/billable parent/);
    const child = addBoqRow(category.quotation, category.categoryId, {
      kind: "heading",
    });
    const pricedChild = addBoqRow(child.quotation, category.categoryId, {
      kind: "priced",
      parentId: child.rowId,
    });
    rows(pricedChild.quotation, category.categoryId).find(
      (r) => r.id === child.rowId,
    )!.pricingType = "Normal Rate";
    expect(validationErrors(pricedChild.quotation)).toContain(
      "Item 1.1: a priced parent cannot also contain child items.",
    );
  });
  it("charges quantities×rates once, excluding By Client parent values and overrides", () => {
    const { q, categoryId, parentId } = scene();
    const parent = rows(q, categoryId)[0];
    Object.assign(parent, {
      quantity: "9",
      rate: "999",
      amountOverride: "9999",
    });
    expect(lineAmount(parent)).toBe(0n);
    expect(boqGroupAmount(q.sections[1], parentId)).toBe(297500n);
    expect(totals(q)).toEqual({
      subtotal: 297500n,
      vat: 14875n,
      grand: 312375n,
    });
  });
  it.each(["FOC", "By Client", "Excluded", "Included"] as const)(
    "preserves non-billable child pricing %s",
    (pricingType) => {
      const { q, categoryId, parentId, childIds } = scene();
      rows(q, categoryId).find((r) => r.id === childIds[0])!.pricingType =
        pricingType;
      expect(boqGroupAmount(q.sections[1], parentId)).toBe(157500n);
      expect(
        renumberBoq(q).sections[1].rows.find((r) => r.id === childIds[0])!
          .pricingType,
      ).toBe(pricingType);
    },
  );
  it("inserts, moves and deletes siblings while preserving IDs and consecutive numbering", () => {
    const { q, categoryId, parentId, childIds } = scene(),
      before = JSON.stringify(q);
    const moved = moveBoqRow(q, categoryId, childIds[2], -1);
    expect(boqTree(moved.sections[1])[0].children.map((n) => n.row.id)).toEqual(
      [childIds[0], childIds[2], childIds[1]],
    );
    const deleted = deleteBoqRow(moved, categoryId, childIds[0]);
    const added = addBoqRow(deleted, categoryId, { kind: "priced", parentId });
    expect(
      boqTree(added.quotation.sections[1])[0].children.map((n) => n.row.number),
    ).toEqual(["2.1.1", "2.1.2", "2.1.3"]);
    expect(JSON.stringify(q)).toBe(before);
    expect(new Set(numbers(added.quotation)).size).toBe(
      numbers(added.quotation).length,
    );
  });
  it("duplicates a complete parent subtree with remapped IDs and parent links", () => {
    const { q, categoryId, parentId, childIds } = scene(),
      before = JSON.stringify(q);
    const copy = duplicateBoqRow(q, categoryId, parentId),
      tree = boqTree(copy.quotation.sections[1]),
      group = tree.find((n) => n.row.id === copy.rowId)!;
    expect(group.row.number).toBe("2.2");
    expect(group.children.map((n) => n.row.number)).toEqual([
      "2.2.1",
      "2.2.2",
      "2.2.3",
    ]);
    expect(group.children.every((n) => n.row.parentId === copy.rowId)).toBe(
      true,
    );
    expect(group.children.every((n) => !childIds.includes(n.row.id))).toBe(
      true,
    );
    expect(boqGroupAmount(copy.quotation.sections[1], copy.rowId)).toBe(
      297500n,
    );
    expect(new Set(ids(copy.quotation)).size).toBe(ids(copy.quotation).length);
    expect(JSON.stringify(q)).toBe(before);
  });
  it("moves and deletes parent groups together with all descendants", () => {
    const { q, categoryId, parentId, secondId, childIds } = scene();
    const moved = moveBoqRow(q, categoryId, parentId, 1),
      tree = boqTree(moved.sections[1]);
    expect(tree.map((n) => n.row.id)).toEqual([secondId, parentId]);
    expect(tree[1].children.map((n) => n.row.id)).toEqual(childIds);
    expect(tree[1].children[0].row.number).toBe("2.2.1");
    const deleted = deleteBoqRow(moved, categoryId, parentId);
    expect(
      rows(deleted, categoryId).some((r) =>
        [parentId, ...childIds].includes(r.id),
      ),
    ).toBe(false);
  });
  it("supports nested heading descendants without using numbers as identity", () => {
    const { q, categoryId, parentId } = scene();
    const nested = addBoqRow(q, categoryId, { kind: "heading", parentId });
    const grandchild = addBoqRow(nested.quotation, categoryId, {
      kind: "priced",
      parentId: nested.rowId,
    });
    const row = rows(grandchild.quotation, categoryId).find(
      (r) => r.id === grandchild.rowId,
    )!;
    expect(row.number).toBe("2.1.4.1");
    expect(row.parentId).toBe(nested.rowId);
  });
  it("duplicates category descendants and every row group with independent IDs", () => {
    const { q, categoryId } = scene();
    const sub = addBoqCategory(q, {
      parentId: categoryId,
      title: "Subcategory",
    });
    const subrow = addBoqRow(sub.quotation, sub.categoryId, { kind: "priced" });
    const copy = duplicateBoqCategory(subrow.quotation, categoryId);
    const children = copy.quotation.sections.filter(
      (s) => s.parentId === copy.categoryId,
    );
    expect(children).toHaveLength(1);
    expect(children[0].rows).toHaveLength(1);
    const oldIds = new Set(ids(subrow.quotation));
    expect(children[0].rows.every((r) => !oldIds.has(r.id))).toBe(true);
    expect(new Set(ids(copy.quotation)).size).toBe(ids(copy.quotation).length);
    expect(new Set(numbers(copy.quotation)).size).toBe(
      numbers(copy.quotation).length,
    );
  });
  it("moves category subtrees together and deletes them without affecting other categories", () => {
    const { q, categoryId } = scene(),
      first = q.sections[0].id;
    const sub = addBoqCategory(q, { parentId: categoryId });
    const moved = moveBoqCategory(sub.quotation, categoryId, -1);
    expect(moved.sections.map((s) => s.id)).toEqual([
      categoryId,
      sub.categoryId,
      first,
    ]);
    const removed = deleteBoqCategory(moved, categoryId);
    expect(removed.sections.map((s) => s.id)).toEqual([first]);
    expect(removed.sections[0].number).toBe("1");
  });
  it("reparents complete row subtrees and rejects cycles or billable targets", () => {
    const { q, categoryId, parentId, secondId, childIds } = scene();
    const moved = setBoqRowParent(q, categoryId, childIds[0], secondId);
    expect(
      rows(moved, categoryId).find((r) => r.id === childIds[0])!,
    ).toMatchObject({ parentId: secondId, number: "2.2.2" });
    expect(() => setBoqRowParent(q, categoryId, parentId, childIds[0])).toThrow(
      /descendants/,
    );
    expect(() => setBoqRowParent(q, categoryId, secondId, childIds[0])).toThrow(
      /billable parent/,
    );
    const lifted = setBoqRowParent(q, categoryId, childIds[0]);
    expect(
      rows(lifted, categoryId).find((r) => r.id === childIds[0])!.parentId,
    ).toBeUndefined();
  });
  it("reparents categories with descendants and rejects category cycles", () => {
    const { q, categoryId } = scene(),
      first = q.sections[0].id;
    const child = addBoqCategory(q, { parentId: categoryId });
    expect(() =>
      setBoqCategoryParent(child.quotation, categoryId, child.categoryId),
    ).toThrow(/descendants/);
    const moved = setBoqCategoryParent(child.quotation, categoryId, first);
    expect(moved.sections.find((s) => s.id === categoryId)!.parentId).toBe(
      first,
    );
    expect(
      moved.sections.find((s) => s.id === child.categoryId)!.parentId,
    ).toBe(categoryId);
  });
  it("rejects adding children to a priced parent rather than silently deleting a charge", () => {
    const { q, categoryId, childIds } = scene(),
      before = JSON.stringify(q);
    expect(() =>
      addBoqRow(q, categoryId, { kind: "priced", parentId: childIds[0] }),
    ).toThrow(/billable parent/);
    expect(JSON.stringify(q)).toBe(before);
  });
  it("retains existing billable parent/child semantics in historical data", () => {
    const q = referenceQuotation(),
      s = q.sections[0];
    s.rows = [
      { ...blankLine(), id: "legacy-parent", quantity: "1", rate: "100" },
      {
        ...blankLine(),
        id: "legacy-child",
        parentId: "legacy-parent",
        quantity: "1",
        rate: "50",
      },
    ];
    expect(boqGroupAmount(s, "legacy-parent")).toBe(15000n);
    expect(renumberBoq(q)).toEqual(q);
  });
});

describe("historical numbering, persistence and PDF mapping", () => {
  it("never rewrites authoritative reference numbering, gaps, manual words or history", () => {
    const q = referenceQuotation(),
      before = JSON.stringify(q),
      layout = layoutQuotation(q);
    expect(numberingMode(q)).toBe("preserve");
    expect(renumberBoq(q)).toEqual(q);
    for (const title of [
      "Demolition work",
      "Tiling",
      "Gypsum Ceiling",
      "Plumbing",
    ]) {
      const section = q.sections.find((s) => s.title === title)!;
      expect(boqTree(section).some((n) => n.children.length > 0)).toBe(true);
    }
    expect(layoutQuotation(renumberBoq(q))).toEqual(layout);
    expect(JSON.stringify(q)).toBe(before);
  });
  it("adds unique reference children without changing any existing IDs/numbers or snapshots", () => {
    const q = referenceQuotation(),
      section = q.sections.find((s) => s.title === "Gypsum Ceiling")!,
      parent = section.rows.find((r) => r.pricingType === "Heading")!,
      existing = new Map(
        q.sections.flatMap((s) => s.rows.map((r) => [r.id, r.number] as const)),
      ),
      before = JSON.stringify(q);
    const added = addBoqRow(q, section.id, {
      kind: "priced",
      parentId: parent.id,
    });
    for (const s of added.quotation.sections)
      for (const row of s.rows)
        if (existing.has(row.id)) expect(row.number).toBe(existing.get(row.id));
    const created = rows(added.quotation, section.id).find(
      (r) => r.id === added.rowId,
    )!;
    expect([...existing.values()]).not.toContain(created.number);
    expect(added.quotation.history).toEqual(q.history);
    expect(JSON.stringify(q)).toBe(before);
  });
  it("preserves manual numbers during reference subtree duplication", () => {
    const q = referenceQuotation(),
      s = q.sections[1],
      parent = s.rows[0],
      old = new Map(s.rows.map((r) => [r.id, r.number]));
    const copy = duplicateBoqRow(q, s.id, parent.id);
    for (const row of rows(copy.quotation, s.id))
      if (old.has(row.id)) expect(row.number).toBe(old.get(row.id));
    const added = rows(copy.quotation, s.id).filter((r) => !old.has(r.id));
    expect(new Set(added.map((r) => r.number)).size).toBe(added.length);
    expect(added.every((r) => ![...old.values()].includes(r.number))).toBe(
      true,
    );
  });
  it("rejects every structural command on issued quotations and preserves issued history bytes", () => {
    const { q, categoryId, parentId } = scene();
    q.status = "Finalized";
    q.finalizedAt = new Date().toISOString();
    q.history.push({
      date: q.finalizedAt,
      action: "Finalized",
      notes: "",
      snapshot: JSON.stringify(q),
    });
    const before = JSON.stringify(q);
    const edits = [
      () => addBoqCategory(q),
      () => addBoqRow(q, categoryId, { kind: "priced" }),
      () => duplicateBoqRow(q, categoryId, parentId),
      () => deleteBoqRow(q, categoryId, parentId),
      () => moveBoqRow(q, categoryId, parentId, 1),
      () => duplicateBoqCategory(q, categoryId),
      () => deleteBoqCategory(q, categoryId),
      () => moveBoqCategory(q, categoryId, -1),
      () => setBoqRowParent(q, categoryId, parentId),
      () => setBoqCategoryParent(q, categoryId),
    ];
    for (const edit of edits) expect(edit).toThrow(/immutable/);
    expect(renumberBoq(q)).toEqual(q);
    expect(JSON.stringify(q)).toBe(before);
  });
  it("preserves numbering of reopened drafts and source revisions", () => {
    const { q, categoryId } = scene();
    q.finalizedAt = "2026-10-01T10:00:00Z";
    q.sections[1].rows[0].number = "Manual A";
    q.history.push({
      date: q.finalizedAt,
      action: "Finalized",
      notes: "",
      snapshot: "immutable-issued-json",
    });
    const added = addBoqRow(q, categoryId, { kind: "priced" });
    expect(rows(added.quotation, categoryId)[0].number).toBe("Manual A");
    expect(added.quotation.history).toEqual(q.history);
    const revision = blankQuotation("REV");
    revision.revisionDetails.sourceId = q.id;
    expect(numberingMode(revision)).toBe("preserve");
  });
  it("rejects orphan/cyclic/duplicate stable IDs without mutating input", () => {
    const { q, categoryId, parentId, childIds } = scene();
    for (const defect of ["orphan", "cycle", "duplicate"]) {
      const broken = structuredClone(q);
      const s = broken.sections[1];
      if (defect === "orphan") s.rows[1].parentId = "missing";
      if (defect === "cycle") s.rows[0].parentId = childIds[0];
      if (defect === "duplicate") s.rows[1].id = parentId;
      const before = JSON.stringify(broken);
      expect(() => addBoqRow(broken, categoryId, { kind: "priced" })).toThrow();
      expect(JSON.stringify(broken)).toBe(before);
    }
  });
  it("round-trips hierarchy and stable IDs through the existing save/load decoder", () => {
    const db = seed();
    initializeCommercial(db);
    const { q } = scene();
    saveQuotation(db, q);
    const loaded = decodeSavedData(JSON.stringify(db)).quotations.find(
      (x) => x.id === q.id,
    )!;
    expect(loaded.sections).toEqual(q.sections);
    expect(ids(loaded)).toEqual(ids(q));
    expect(totals(loaded)).toEqual(totals(q));
  });
  it("maps hierarchical numbers and long descriptions into the unchanged multi-page document", () => {
    const { q, categoryId, parentId, childIds } = scene();
    rows(q, categoryId).find((r) => r.id === parentId)!.description =
      "Interior paint parent with detailed approved material specifications.\n".repeat(
        35,
      );
    rows(q, categoryId).find((r) => r.id === childIds[0])!.description =
      "Living room wall preparation and paint application.\n".repeat(40);
    const before = JSON.stringify(q),
      pages = layoutQuotation(q),
      texts = pages.flatMap((p) =>
        p.commands.filter((c) => c.kind === "text").map((c) => c.text),
      );
    expect(pages.length).toBeGreaterThan(2);
    for (const number of ["2.1", "2.1.1", "2.1.2", "2.1.3", "2.2", "2.2.1"])
      expect(texts).toContain(number);
    expect(texts).toContain("1,400.00");
    expect(JSON.stringify(q)).toBe(before);
  });
});

describe("nested work-category numbering", () => {
  it("numbers empty nested categories 1,1.1,1.1.1 instead of separate roots", () => {
    let q = blankQuotation("NESTED");
    const root = addBoqCategory(q);
    q = root.quotation;
    const child = addBoqCategory(q, { parentId: root.categoryId });
    q = child.quotation;
    const nested = addBoqCategory(q, { parentId: child.categoryId });
    expect(nested.quotation.sections.map((s) => s.number)).toEqual([
      "1",
      "1.1",
      "1.1.1",
    ]);
    expect(nested.quotation.sections.map((s) => s.id)).toEqual([
      root.categoryId,
      child.categoryId,
      nested.categoryId,
    ]);
  });
  it("shares ordinal slots between rows and subcategories without generated collisions", () => {
    let q = blankQuotation("MIXED");
    const root = addBoqCategory(q);
    q = root.quotation;
    const child = addBoqCategory(q, { parentId: root.categoryId });
    q = child.quotation;
    const row = addBoqRow(q, root.categoryId, { kind: "priced" });
    q = row.quotation;
    const childRow = addBoqRow(q, child.categoryId, { kind: "priced" });
    q = childRow.quotation;
    const nested = addBoqCategory(q, { parentId: child.categoryId });
    q = nested.quotation;
    expect(q.sections.map((s) => s.number)).toEqual(["1", "1.2", "1.2.2"]);
    expect(q.sections[0].rows[0].number).toBe("1.1");
    expect(q.sections[1].rows[0].number).toBe("1.2.1");
    expect(new Set(numbers(q)).size).toBe(numbers(q).length);
  });
  it("moves and duplicates nested category numbers with complete stable-ID subtrees", () => {
    let q = blankQuotation("MOVE-CATEGORIES");
    const first = addBoqCategory(q);
    q = first.quotation;
    const second = addBoqCategory(q);
    q = second.quotation;
    const child = addBoqCategory(q, { parentId: second.categoryId });
    q = child.quotation;
    const item = addBoqRow(q, child.categoryId, { kind: "priced" });
    q = item.quotation;
    q = moveBoqCategory(q, second.categoryId, -1);
    expect(q.sections.map((s) => s.number)).toEqual(["1", "1.1", "2"]);
    expect(q.sections[1].rows[0]).toMatchObject({
      id: item.rowId,
      number: "1.1.1",
    });
    const copy = duplicateBoqCategory(q, second.categoryId);
    expect(copy.quotation.sections.map((s) => s.number)).toEqual([
      "1",
      "1.1",
      "2",
      "2.1",
      "3",
    ]);
    expect(copy.quotation.sections[3].rows[0].number).toBe("2.1.1");
    expect(copy.quotation.sections[3].rows[0].id).not.toBe(item.rowId);
    expect(new Set(numbers(copy.quotation)).size).toBe(
      numbers(copy.quotation).length,
    );
  });
  it("reparents a category subtree into the correct shared namespace", () => {
    let q = blankQuotation("REPARENT-CATEGORY");
    const first = addBoqCategory(q);
    q = first.quotation;
    q = addBoqRow(q, first.categoryId, { kind: "priced" }).quotation;
    const second = addBoqCategory(q);
    q = second.quotation;
    const child = addBoqCategory(q, { parentId: second.categoryId });
    q = child.quotation;
    q = setBoqCategoryParent(q, second.categoryId, first.categoryId);
    expect(q.sections.map((s) => s.number)).toEqual(["1", "1.2", "1.2.1"]);
    expect(q.sections[0].rows[0].number).toBe("1.1");
    expect(new Set(numbers(q)).size).toBe(numbers(q).length);
  });
});
