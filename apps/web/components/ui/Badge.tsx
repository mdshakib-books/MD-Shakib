import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "gold" | "discount" | "success" | "danger" | "muted";
}

export function Badge({
  className,
  variant = "gold",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    gold: "bg-[#C9A24A]/10 text-[#C9A24A] border border-[#C9A24A]/30",
    discount: "bg-[#FFF5D1] text-black font-bold shadow-sm",
    success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
    danger: "bg-red-500/10 text-red-400 border border-red-500/30",
    muted: "bg-[#161616] text-[#888888] border border-[#2A2A2A]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium tracking-wide",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

