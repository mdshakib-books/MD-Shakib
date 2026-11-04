import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      error,
      label,
      helperText,
      id,
      required,
      rows = 4,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;

    return (
      <div className="w-full text-left space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 font-sans"
          >
            {label}
            {required && <span className="text-[#C9A24A] ml-1">*</span>}
          </label>
        )}

        <textarea
          id={textareaId}
          ref={ref}
          rows={rows}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? errorId : helperText ? helperId : undefined
          }
          className={cn(
            "w-full px-4 py-3 bg-[#0E0E0E] border border-[#2A2A2A] text-[#F5F5F5] placeholder-[#737373] rounded-lg text-sm transition-all duration-[var(--duration-micro)] [transition-timing-function:var(--ease-luxury)] focus:outline-none focus:border-[#C9A24A] focus:ring-1 focus:ring-[#C9A24A]/40 disabled:opacity-50 disabled:cursor-not-allowed resize-y",
            error &&
              "border-red-500/80 focus:border-red-500 focus:ring-red-500/30",
            className
          )}
          {...props}
        />

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

Textarea.displayName = "Textarea";

