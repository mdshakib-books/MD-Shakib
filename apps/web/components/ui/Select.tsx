import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      error,
      label,
      helperText,
      id,
      required,
      options,
      children,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    return (
      <div className="w-full text-left space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 font-sans"
          >
            {label}
            {required && <span className="text-[#C9A24A] ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={cn(
              "w-full h-11 pl-4 pr-10 bg-[#0E0E0E] border border-[#2A2A2A] text-[#F5F5F5] rounded-lg text-sm appearance-none transition-all duration-[var(--duration-micro)] [transition-timing-function:var(--ease-luxury)] focus:outline-none focus:border-[#C9A24A] focus:ring-1 focus:ring-[#C9A24A]/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
              error &&
                "border-red-500/80 focus:border-red-500 focus:ring-red-500/30",
              className
            )}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className="bg-[#141414] text-neutral-200 py-1"
                  >
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

          {/* Quiet luxury custom chevron */}
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 transition-colors duration-[var(--duration-micro)]">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {error ? (
          <p id={errorId} className="text-xs text-red-400 font-medium animate-fade-in">
            {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-neutral-400 animate-fade-in">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = "Select";

