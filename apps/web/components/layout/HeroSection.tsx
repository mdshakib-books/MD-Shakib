import * as React from "react";

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
      <div className="relative w-full h-[280px] md:h-[400px] lg:h-[520px] overflow-hidden group">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105"
          style={{
            backgroundImage: `url("https://plus.unsplash.com/premium_photo-1677231559663-b9f6a7c33c77?q=80&w=3540&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D")`,
          }}
        />

        {/* Dark Editorial Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/75 to-black/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B] via-transparent to-black/40" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-4 pt-16 md:pt-24 lg:pt-28">
          <p className="text-[#E5C87B] text-[11px] md:text-xs tracking-[0.35em] uppercase font-semibold font-sans mb-1 animate-fade-in">
            {presentingText}
          </p>

          <h1 className="font-serif text-2xl md:text-3xl lg:text-4xl text-[#E5C87B] tracking-[0.1em] text-center my-2 md:my-3 drop-shadow-[0_2px_15px_rgba(229,200,123,0.4)] animate-fade-in-up">
            {arabicTitle}
          </h1>

          <p className="text-neutral-300 max-w-sm md:max-w-lg text-xs md:text-sm font-light leading-relaxed animate-fade-in">
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
      title: "Free Express Shipping",
      description: "Carefully packaged delivery across India",
      icon: (
        <svg className="w-5 h-5 text-[#C9A24A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      title: "Secure Checkout",
      description: "100% encrypted UPI & Card payments",
      icon: (
        <svg className="w-5 h-5 text-[#C9A24A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      ),
    },
    {
      id: 3,
      title: "Authentic Scholarship",
      description: "Verified Islamic literature & Tafseer",
      icon: (
        <svg className="w-5 h-5 text-[#C9A24A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
    },
  ];

  return (
    <section className="py-6 border-b border-[#222222] bg-[#0E0E0E]/40">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {indicators.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 p-4 rounded-xl bg-[#141414] border border-[#262626] hover:border-[#C9A24A]/40 transition-colors duration-[var(--duration-card)] [transition-timing-function:var(--ease-luxury)]"
            >
              <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-[#1C1C1C] border border-[#2A2A2A] shrink-0 shadow-inner">
                {item.icon}
              </div>

              <div>
                <h3 className="font-serif text-sm text-white font-medium">
                  {item.title}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5 font-light">
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
