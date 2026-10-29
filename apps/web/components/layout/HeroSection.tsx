import * as React from "react";
import Image from "next/image";

export interface HeroSectionProps {
  presentingText?: string;
  arabicTitle?: string;
  blessingText?: string;
}

export function HeroSection({
  presentingText = "PRESENTING",
  arabicTitle = "محمد شکیب صدیقی",
  blessingText = "May we all be showered with grace, guidance, and blessings from Allah SWT.",
}: HeroSectionProps) {
  return (
    <section className="w-full relative">
      <div className="relative w-full h-[260px] md:h-[380px] lg:h-[500px] overflow-hidden group">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105"
          style={{
            backgroundImage: `url("https://plus.unsplash.com/premium_photo-1677231559663-b9f6a7c33c77?q=80&w=3540&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D")`,
          }}
        />

        {/* Dark Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/40" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-4 pt-18 md:pt-28 lg:pt-32">
          <p className="text-[var(--color-accent-gold)] text-xs md:text-sm tracking-[0.3em] uppercase opacity-90 font-medium font-sans animate-pulse">
            {presentingText}
          </p>

          <h2 className="font-serif text-[20px] md:text-[26px] lg:text-[32px] text-[#E5C87B] tracking-[0.1em] text-center mt-[10px] mb-4 md:mb-6 drop-shadow-[0_2px_15px_rgba(229,200,123,0.6)]">
            {arabicTitle}
          </h2>

          <p className="text-neutral-400 max-w-sm md:max-w-md text-xs md:text-sm font-light leading-relaxed">
            {blessingText}
          </p>
        </div>
      </div>
    </section>
  );
}

export function TrustIndicators() {
  const indicators = [
    {
      id: 1,
      title: "Free Shipping",
      description: "Fast delivery across India",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M8 7h12m0 0l1 1v6a2 2 0 01-2 2h-1M5 7h2m-2 4h2m-4 8a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z"
          />
        </svg>
      ),
    },
    {
      id: 2,
      title: "Secure Payments",
      description: "100% protected transactions",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4"
          />
        </svg>
      ),
    },
    {
      id: 3,
      title: "Verified Quality",
      description: "Authentic Islamic books",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M9 12l2 2 4-4"
          />
        </svg>
      ),
    },
  ];

  return (
    <section className="py-8 bg-transparent">
      <div className="max-w-[1100px] mx-auto px-4">
        <div className="grid grid-cols-3 gap-4 md:gap-8">
          {indicators.map((item) => (
            <div
              key={item.id}
              className="flex flex-col items-center text-center md:flex-row md:text-left md:gap-3"
            >
              {/* icon */}
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-[#C9A24A] text-[#C9A24A] mb-2 md:mb-0">
                {item.icon}
              </div>

              {/* text */}
              <div>
                <h3 className="font-serif text-xs md:text-sm text-white font-medium">
                  {item.title}
                </h3>
                <p className="hidden md:block text-xs text-neutral-400">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

