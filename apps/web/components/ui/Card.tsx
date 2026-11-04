import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "interactive";
}

export function Card({
  className,
  variant = "default",
  ...props
}: CardProps) {
  const variantStyles = {
    default: "bg-[#161616] border border-[#2A2A2A]",
    elevated: "bg-[#1A1A1A] border border-[#333333] shadow-luxury",
    interactive:
      "bg-[#161616] border border-[#2A2A2A] hover:border-[#C9A24A]/60 hover:-translate-y-1 hover:shadow-luxury-hover transition-all duration-[var(--duration-card)] [transition-timing-function:var(--ease-luxury)]",
  };

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden text-neutral-100",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 p-5 sm:p-6 border-b border-[#222222]", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-serif text-lg sm:text-xl font-semibold tracking-wide text-white uppercase",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs sm:text-sm text-neutral-400 font-light", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-5 sm:p-6 border-t border-[#222222] bg-[#121212]/50",
        className
      )}
      {...props}
    />
  );
}

