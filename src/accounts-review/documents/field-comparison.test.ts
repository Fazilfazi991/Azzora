import { expect, it } from "vitest";
import { reviewFieldsEqual } from "./field-comparison";
it("ignores object key order while retaining real changes, absent discount, and item order", () => {
  const before = {
    supplier: "Fictional",
    items: [
      { unit: "DRM", discount: "" },
      { unit: "EA", discount: "0.00" },
    ],
  };
  const reordered = {
    items: [
      { discount: "", unit: "DRM" },
      { discount: "0.00", unit: "EA" },
    ],
    supplier: "Fictional",
  };
  expect(reviewFieldsEqual(before, reordered)).toBe(true);
  expect(
    reviewFieldsEqual(before, {
      ...reordered,
      items: [...reordered.items].reverse(),
    }),
  ).toBe(false);
  expect(
    reviewFieldsEqual(before, {
      ...reordered,
      items: [{ unit: "DRM", discount: "0.00" }, reordered.items[1]],
    }),
  ).toBe(false);
  expect(reviewFieldsEqual(before, { ...reordered, supplier: "Changed" })).toBe(
    false,
  );
});
