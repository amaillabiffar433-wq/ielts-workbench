import type { ReactNode } from "react";
import "./common.css";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  accessibleLabel?: string;
};

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div aria-label={label} className="segmented-control" role="group">
      {options.map((option) => (
        <button
          aria-label={option.accessibleLabel}
          aria-pressed={value === option.value}
          className={value === option.value ? "is-active" : undefined}
          disabled={disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
