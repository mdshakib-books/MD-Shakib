"use client";

import { useEffect } from "react";
import Link from "next/link";

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
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center max-w-lg mx-auto">
      <div className="w-14 h-14 mb-4 rounded-full border border-red-500/30 bg-red-950/20 flex items-center justify-center">
        <span className="text-xl text-red-400">⚠️</span>
      </div>

      <h2 className="text-2xl font-bold tracking-wider text-neutral-100 uppercase mb-3">
        Something went wrong
      </h2>

      <p className="text-sm text-[#888888] mb-8 font-sans">
        An unexpected error occurred while processing this page.
      </p>

      <div className="flex gap-4">
        <button
          onClick={() => reset()}
          type="button"
          className="px-6 py-2.5 rounded-lg border border-[#C9A24A] bg-[#C9A24A] text-black text-xs font-semibold tracking-wider uppercase hover:bg-[#b89139] transition-colors cursor-pointer"
        >
          Try Again
        </button>
        <Link
          href="/"
          className="px-6 py-2.5 rounded-lg border border-[#2A2A2A] bg-[#161616] text-neutral-300 text-xs font-medium tracking-wider uppercase hover:border-[#C9A24A] hover:text-[#C9A24A] transition-colors flex items-center"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}

