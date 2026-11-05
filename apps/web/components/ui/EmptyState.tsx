import * as React from "react";
import Link from "next/link";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title?: string;
  message?: string;
  description?: string;
  icon?: React.ReactNode;
  actionText?: string;
  actionLabel?: string;
  actionUrl?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
  headingLevel?: "h1" | "h2" | "h3";
}

export function EmptyState({
  title,
  message = "No records found",
  description,
  icon,
  actionText,
  actionLabel,
  actionUrl,
  actionHref,
  onAction,
  className,
  headingLevel = "h2",
}: EmptyStateProps) {
  const displayTitle = title || message;
  const displayDesc = description || (title ? message : undefined);
  const btnLabel = actionLabel || actionText;
  const btnHref = actionHref || actionUrl;
  const HeadingTag = headingLevel;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center max-w-md mx-auto bg-dark-card/50 border border-dark-border rounded-2xl my-6 shadow-luxury animate-fade-in-up",
        className
      )}
    >
      <div className="w-16 h-16 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center text-[var(--color-primary-gold)] mb-5 shadow-inner">
        {icon || (
          <svg
            className="w-8 h-8 text-neutral-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        )}
      </div>

      <HeadingTag className="font-serif text-lg md:text-xl font-semibold text-white uppercase tracking-wide">
        {displayTitle}
      </HeadingTag>

      {displayDesc && (
        <p className="text-xs sm:text-sm text-neutral-400 mt-2 max-w-sm leading-relaxed font-light">
          {displayDesc}
        </p>
      )}

      {btnLabel && (
        <div className="mt-6">
          {btnHref ? (
            <Link
              href={btnHref}
              className="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] bg-[#C9A24A] hover:bg-[#B89139] text-black font-semibold shadow-md shadow-[#C9A24A]/10 hover:shadow-[0_4px_16px_rgba(201,162,74,0.25)] border border-[#C9A24A]/40 text-xs px-4 py-2 h-9 gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0B] active:scale-[0.98]"
            >
              {btnLabel}
            </Link>
          ) : onAction ? (
            <Button variant="primary" size="sm" onClick={onAction}>
              {btnLabel}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
