import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost" | "link";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#C9A24A]/60 focus:ring-offset-2 focus:ring-offset-[#0B0B0B] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none active:scale-[0.98]";

    const variantStyles = {
      primary:
        "bg-[#C9A24A] hover:bg-[#B89139] text-black font-semibold shadow-md shadow-[#C9A24A]/10 border border-[#C9A24A]/40",
      secondary:
        "bg-[#161616] border border-[#2A2A2A] text-neutral-200 hover:border-[#C9A24A]/60 hover:text-[#C9A24A] hover:bg-[#1A1A1A]",
      outline:
        "bg-transparent border border-[#C9A24A] text-[#C9A24A] hover:bg-[#C9A24A] hover:text-black font-semibold",
      danger:
        "bg-red-950/40 border border-red-800/60 text-red-400 hover:bg-red-900/60 hover:text-white font-medium",
      ghost:
        "bg-transparent text-neutral-400 hover:text-neutral-100 hover:bg-[#1A1A1A]",
      link:
        "bg-transparent text-[#C9A24A] hover:underline p-0 h-auto font-medium focus:ring-0",
    };

    const sizeStyles = {
      sm: "text-xs px-3 py-1.5 h-8 gap-1.5",
      md: "text-sm px-4 py-2.5 h-10 gap-2",
      lg: "text-base px-6 py-3 h-12 gap-2.5 font-semibold",
      icon: "w-9 h-9 p-0 flex items-center justify-center",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4 text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              />
            </svg>
            <span>Loading...</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
