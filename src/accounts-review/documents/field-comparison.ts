/** Compare saved review values without treating JSON object-key order as an edit. */
export function reviewFieldsEqual(left: unknown, right: unknown): boolean {
  const normalized = (value: unknown) =>
    JSON.stringify(value, (_key, item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      return Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
      );
    });
  return normalized(left) === normalized(right);
}
