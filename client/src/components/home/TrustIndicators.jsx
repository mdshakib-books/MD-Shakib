import React from "react";

const indicators = [
  {
    id: 1,
    title: "Free Shipping",
    description: "Fast delivery across India",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
          d="M9 12l2 2 4-4"
        />
      </svg>
    ),
  },
];

const TrustIndicators = () => {
  return (
    <section className="py-6 bg-transparent">

      <div className="max-w-[1100px] mx-auto px-4">

        <div className="grid grid-cols-3 gap-4 md:gap-8">

          {indicators.map((item) => (
            <div
              key={item.id}
              className="
              flex flex-col items-center text-center
              md:flex-row md:text-left md:gap-3
              "
            >

              {/* icon */}
              <div
                className="
                flex items-center justify-center
                w-10 h-10
                rounded-full
                border border-[#C9A24A]
                text-[#C9A24A]
                mb-2 md:mb-0
                "
              >
                {item.icon}
              </div>

              {/* text */}
              <div>

                <h3 className="font-heading text-xs md:text-sm text-white">
                  {item.title}
                </h3>

                <p className="hidden md:block text-xs text-gray-400">
                  {item.description}
                </p>

              </div>

            </div>
          ))}

        </div>

      </div>

    </section>
  );
};

export default TrustIndicators;