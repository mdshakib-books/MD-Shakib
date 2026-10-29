import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "full";
}

export function PageContainer({
  children,
  className,
  size = "lg",
}: PageContainerProps) {
  const sizeClasses = {
    sm: "max-w-3xl",
    md: "max-w-5xl",
    lg: "max-w-[1200px]",
    full: "max-w-full",
  };

  return (
    <div
      className={cn(
        "w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12",
        sizeClasses[size],
        className
      )}
    >
      {children}
    </div>
  );
}

export interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  align?: "left" | "center" | "right";
  className?: string;
}

export function SectionHeading({
  title,
  subtitle,
  align = "center",
  className,
}: SectionHeadingProps) {
  const alignClasses = {
    left: "text-left items-start",
    center: "text-center items-center",
    right: "text-right items-end",
  };

  return (
    <div className={cn("flex flex-col mb-8 md:mb-12", alignClasses[align], className)}>
      <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wider text-[var(--color-primary-gold)] uppercase">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 text-sm md:text-base text-neutral-400 font-light max-w-xl">
          {subtitle}
        </p>
      )}
      <div className="mt-4 w-12 h-0.5 bg-[var(--color-primary-gold)]/60 rounded-full" />
    </div>
  );
}

