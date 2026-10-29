import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  message?: string;
  actionText?: string;
  actionUrl?: string;
  className?: string;
}

export function EmptyState({
  message = "No data found",
  actionText,
  actionUrl,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto px-4",
        className
      )}
    >
      <div className="mb-6 text-neutral-500">
        <svg
          className="w-16 h-16 mx-auto"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>

      <h3 className="text-lg md:text-xl font-medium text-neutral-200">{message}</h3>

      {actionText && actionUrl && (
        <Link
          href={actionUrl}
          className="mt-6 px-6 py-2.5 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold hover:bg-[var(--color-accent-gold)] transition-colors text-sm shadow-md"
        >
          {actionText}
        </Link>
      )}
    </div>
  );
}

