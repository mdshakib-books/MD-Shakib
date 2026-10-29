import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", error, label, id, ...props }, ref) => {
    return (
      <div className="w-full text-left space-y-1.5">
        {label && (
          <label
            htmlFor={id}
            className="block text-xs font-medium text-neutral-300 font-sans"
          >
            {label}
          </label>
        )}
        <input
          id={id}
          type={type}
          ref={ref}
          className={cn(
            "w-full h-11 px-4 bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] placeholder-[#9CA3AF] rounded-lg text-sm focus:outline-none focus:border-[#C9A24A] focus:shadow-[0_0_10px_rgba(201,162,74,0.25)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
            error && "border-red-500 focus:border-red-500 focus:shadow-[0_0_10px_rgba(239,68,68,0.25)]",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

