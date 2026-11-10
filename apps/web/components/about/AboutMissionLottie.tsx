"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import DotLottieReact with SSR disabled and local WASM binary configuration
const DotLottieReact = dynamic(
  () =>
    import("@lottiefiles/dotlottie-react").then((mod) => {
      if (typeof window !== "undefined") {
        try {
          // Explicitly configure self-hosted WASM binary in /public to avoid external CDN fetch failures
          mod.setWasmUrl("/dotlottie-player.wasm");
        } catch {
          // Fall back gracefully to standard resolver
        }
      }
      return mod.DotLottieReact;
    }),
  {
    ssr: false,
    loading: () => <LottieLoadingPlaceholder />,
  }
);

function LottieLoadingPlaceholder() {
  return (
    <div
      className="w-full h-full min-h-[220px] flex items-center justify-center text-[#C9A24A]/60 animate-pulse"
      aria-hidden="true"
    >
      <div className="w-16 h-16 rounded-full border border-[#C9A24A]/20 bg-[#C9A24A]/5 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-[#C9A24A]/40"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      </div>
      <span className="sr-only">Loading mission animation...</span>
    </div>
  );
}

function LottieFallbackIllustration() {
  return (
    <div
      className="w-full h-full min-h-[240px] flex flex-col items-center justify-center p-6 text-center select-none"
      aria-hidden="true"
    >
      <div className="relative mb-4">
        <div className="absolute -inset-4 bg-[#C9A24A]/10 rounded-full blur-xl" />
        <div className="relative w-20 h-20 rounded-2xl bg-[#141414] border border-[#C9A24A]/30 flex items-center justify-center text-[#C9A24A] shadow-[0_0_30px_rgba(201,162,74,0.12)]">
          <svg
            className="w-10 h-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
      </div>
      <p className="font-serif text-[#C9A24A] text-sm tracking-widest uppercase">
        Preserving Authentic Knowledge
      </p>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class LottieErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Gracefully catch any unhandled WebAssembly / WebGL / Canvas instantiation errors
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface AboutMissionLottieProps {
  className?: string;
}

export function AboutMissionLottie({ className }: AboutMissionLottieProps) {
  const [animationSrc, setAnimationSrc] = useState("/assets/about-mission.lottie");

  return (
    <div
      className={
        className ||
        "w-full h-[260px] md:h-[320px] rounded-xl flex items-center justify-center text-[#C9A24A] text-lg font-heading overflow-hidden"
      }
    >
      <LottieErrorBoundary fallback={<LottieFallbackIllustration />}>
        <DotLottieReact
          src={animationSrc}
          loop
          autoplay
          dotLottieRefCallback={(dotLottie) => {
            if (!dotLottie) return;
            dotLottie.addEventListener("loadError", () => {
              // If local asset fails, try remote CDN host as fallback
              if (animationSrc === "/assets/about-mission.lottie") {
                setAnimationSrc(
                  "https://lottie.host/5ebc2c19-0da1-437d-9129-323967dd35f2/nJ7OSQpbM0.lottie"
                );
              }
            });
          }}
        />
      </LottieErrorBoundary>
    </div>
  );
}
