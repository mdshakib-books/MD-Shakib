"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client/runtime error safely without assuming Node process.env in browser
    console.error("Application error boundary triggered:", error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center max-w-lg mx-auto"
    >
      <div className="w-14 h-14 mb-4 rounded-full border border-red-500/30 bg-red-950/20 flex items-center justify-center text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.15)]">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>

      <h1 className="text-2xl font-serif font-bold tracking-wider text-neutral-100 uppercase mb-3">
        Something went wrong
      </h1>

      <p className="text-sm text-neutral-400 mb-8 font-sans max-w-sm">
        An unexpected error occurred while processing this request. Our team has been notified.
      </p>

      <div className="flex gap-4">
        <Button
          onClick={() => reset()}
          variant="primary"
          size="md"
        >
          Try Again
        </Button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg font-medium transition-all duration-[var(--duration-fast)] cursor-pointer text-xs uppercase tracking-wider px-5 py-2.5 border border-[#C9A24A]/40 text-[#C9A24A] hover:bg-[#C9A24A]/10 hover:border-[#C9A24A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0B]"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
