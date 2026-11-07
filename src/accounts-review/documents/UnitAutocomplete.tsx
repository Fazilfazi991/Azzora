import { useId, useState } from "react";

const commonUnits = [
  "DRM",
  "EA",
  "PCS",
  "KG",
  "L",
  "M",
  "M2",
  "M3",
  "BOX",
  "SET",
  "HOUR",
  "DAY",
];
const normalized = (s: string) =>
  s.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
export function unitSuggestions(values: string[], query = ""): string[] {
  return [
    ...new Set([...values, ...commonUnits].map(normalized).filter(Boolean)),
  ].filter(
    (v) =>
      v.startsWith(normalized(query)) && (!query || v !== normalized(query)),
  );
}

/** Suggestions come only from the authorized snapshot and current form. Raw values are never normalized on save. */
export function UnitAutocomplete({
  value,
  values,
  label,
  onChange,
  invalid,
  field,
}: {
  value: string;
  values: string[];
  label: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  field?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = unitSuggestions(values, value);
  const select = (unit: string) => {
    onChange(unit);
    setOpen(false);
    setActive(-1);
  };
  return (
    <span className="entry-unit-combobox">
      <input
        role="combobox"
        aria-label={label}
        data-review-field={field}
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
        aria-controls={id}
        aria-activedescendant={
          open && active >= 0 ? `${id}-${active}` : undefined
        }
        aria-invalid={invalid || undefined}
        value={value}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((a) =>
              options.length
                ? a < 0
                  ? e.key === "ArrowDown"
                    ? 0
                    : options.length - 1
                  : (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) %
                    options.length
                : -1,
            );
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && active >= 0 && options[active]) select(options[active]);
          }
        }}
      />
      {open && options.length > 0 && (
        <span
          id={id}
          role="listbox"
          aria-label="Unit suggestions"
          className="entry-unit-options"
        >
          {options.map((unit, i) => (
            <span
              role="option"
              aria-selected={i === active}
              id={`${id}-${i}`}
              key={unit}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                select(unit);
              }}
            >
              {unit}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
