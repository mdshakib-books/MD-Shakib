"use client";

import * as React from "react";
import { useState, useEffect, useRef, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function getServerSnapshot() {
  return true;
}

export function NetworkStatusBanner() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [showReconnected, setShowReconnected] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevOnlineRef = useRef(true);

  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      // Transitioned from offline to online
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  if (!isOnline && !dismissed) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 left-0 right-0 z-[10001] bg-[#141414] border-b border-[#C9A24A]/40 text-[#F5F5F5] px-4 py-2.5 shadow-luxury flex items-center justify-between text-xs sm:text-sm animate-fade-in"
      >
        <div className="flex items-center gap-2 max-w-[85%]">
          <svg className="w-4 h-4 text-[#C9A24A] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.828m2.829 2.828L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.828m-4.243 4.243a9 9 0 01-12.728 0m0 0l2.829-2.828m-2.829 2.828L3 21m2.828-5.657a5 5 0 010-7.072m0 0l2.829 2.828m0 0a1 1 0 101.414-1.414" />
          </svg>
          <span className="truncate">
            <strong>Offline Mode:</strong> Internet connection lost. Some features like live checkout may be unavailable until restored.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.location.reload()}
            aria-label="Retry network connection"
            className="px-2.5 py-1 text-xs font-semibold rounded bg-[#C9A24A] text-black hover:bg-[#E5C87B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss offline alert"
            className="text-neutral-400 hover:text-white p-1 rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-4 right-4 z-[10001] bg-[#141414] border border-emerald-500/50 text-emerald-400 px-4 py-2.5 rounded-xl shadow-luxury flex items-center gap-2 text-xs animate-fade-in"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
        <span>Connection restored. Back online.</span>
      </div>
    );
  }

  return null;
}
