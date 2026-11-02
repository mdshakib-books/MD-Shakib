import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "gold"
    | "discount"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "muted"
    | "outline";
  size?: "sm" | "md";
}

export function Badge({
  className,
  variant = "gold",
  size = "md",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    gold: "bg-[#C9A24A]/10 text-[#C9A24A] border border-[#C9A24A]/30",
    discount: "bg-[#FFF5D1] text-black font-bold shadow-sm",
    success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
    warning: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
    danger: "bg-red-500/10 text-red-400 border border-red-500/30",
    info: "bg-blue-500/10 text-blue-400 border border-blue-500/30",
    muted: "bg-[#181818] text-[#888888] border border-[#2A2A2A]",
    outline: "bg-transparent text-neutral-300 border border-[#2A2A2A]",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-0.5 text-xs",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium tracking-wide rounded-md transition-colors",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
