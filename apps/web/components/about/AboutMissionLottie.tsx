"use client";

import dynamic from "next/dynamic";

// Dynamically import DotLottieReact with SSR disabled to prevent server-side canvas / WebAssembly evaluation
const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((mod) => mod.DotLottieReact),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full h-full flex items-center justify-center text-[#C9A24A]/60 animate-pulse"
        aria-hidden="true"
      >
        <span className="sr-only">Loading animation...</span>
      </div>
    ),
  }
);

interface AboutMissionLottieProps {
  className?: string;
}

export function AboutMissionLottie({ className }: AboutMissionLottieProps) {
  return (
    <div
      className={
        className ||
        "w-full h-[260px] md:h-[320px] rounded-xl flex items-center justify-center text-[#C9A24A] text-lg font-heading"
      }
    >
      <DotLottieReact
        src="https://lottie.host/5ebc2c19-0da1-437d-9129-323967dd35f2/nJ7OSQpbM0.lottie"
        loop
        autoplay
      />
    </div>
  );
}
