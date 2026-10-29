import * as React from "react";
import { cn } from "@/lib/utils";

export interface LoaderProps {
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Loader({ fullScreen = false, size = "md", className }: LoaderProps) {
  const sizeClasses = {
    sm: "h-6 w-6 border-2",
    md: "h-10 w-10 border-2",
    lg: "h-14 w-14 border-3",
  };

  return (
    <div
      className={cn(
        "flex justify-center items-center",
        fullScreen ? "fixed inset-0 bg-[#0B0B0B]/80 z-50 backdrop-blur-sm" : "py-8",
        className
      )}
    >
      <div
        className={cn(
          "animate-spin rounded-full border-t-transparent border-[var(--color-primary-gold)]",
          sizeClasses[size]
        )}
      />
    </div>
  );
}

