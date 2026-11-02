import * as React from "react";

interface Step {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const steps: Step[] = [
  {
    id: 1,
    title: "Browse Books",
    description: "Explore authentic Quran, Hadith, and classical scholarly volumes",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    id: 2,
    title: "Add To Cart",
    description: "Select desired volumes and quantities with immediate cart review",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
        />
      </svg>
    ),
  },
  {
    id: 3,
    title: "Secure Checkout",
    description: "Save delivery address and complete payment via COD or online",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
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
    id: 4,
    title: "Fast Delivery",
    description: "Receive high-quality editions carefully packed within 3–5 days",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M8 7h12m0 0l1 1v6a2 2 0 01-2 2h-1M5 7h2m-2 4h2m-4 8a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z"
        />
      </svg>
    ),
  },
];

export function OrderSteps() {
  return (
    <section className="py-20 w-full bg-[#0E0E0E] border-t border-[#222222]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <p className="text-[#C9A24A] text-xs uppercase tracking-[0.25em] font-semibold font-sans mb-2">
            Seamless Ordering
          </p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-white tracking-wide uppercase">
            How To Order
          </h2>
          <div className="w-16 h-0.5 bg-[#C9A24A]/70 mx-auto rounded-full mt-4" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex flex-col items-center text-center p-6 rounded-2xl bg-[#141414] border border-[#262626] hover:border-[#C9A24A]/50 transition-all duration-300 group"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#1C1C1C] border border-[#2A2A2A] flex items-center justify-center text-[#C9A24A] mb-5 shadow-inner transition-transform duration-300 group-hover:scale-105 group-hover:border-[#C9A24A]/60 relative">
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-[#C9A24A] text-black font-bold text-xs rounded-full flex items-center justify-center shadow-md">
                  {step.id}
                </div>
                {step.icon}
              </div>

              <h3 className="text-base font-serif font-semibold text-white tracking-wide mb-2">
                {step.title}
              </h3>
              <p className="text-xs text-neutral-400 font-light leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
