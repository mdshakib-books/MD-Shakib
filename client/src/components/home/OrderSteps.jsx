import React from "react";

const steps = [
    {
        id: 1,
        title: "Browse Books",
        icon: (
            <svg
                className="w-8 h-8"
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
        ),
    },
    {
        id: 2,
        title: "Add To Cart",
        icon: (
            <svg
                className="w-8 h-8"
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
        icon: (
            <svg
                className="w-8 h-8"
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
        icon: (
            <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
            </svg>
        ),
    },
];

const OrderSteps = () => {
    return (
        <section className="py-20 w-full bg-[var(--color-main-bg)]">
            <div className="max-w-[1200px] mx-auto px-4 lg:px-6">
                <div className="text-center mb-16">
                    <h2 className="text-2xl md:text-3xl font-heading font-bold text-[var(--color-text-light)] mb-4 tracking-wide">
                        How To Order
                    </h2>
                    <div className="w-24 h-1 bg-[var(--color-primary-gold)] mx-auto rounded-full opacity-80"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 relative">
                    {steps.map((step) => (
                        <div
                            key={step.id}
                            className="relative z-10 flex flex-col items-center text-center group"
                        >
                            <div className="w-20 h-20 rounded-full bg-[#111111] border border-[var(--color-primary-gold)] flex items-center justify-center text-[var(--color-primary-gold)] mb-6 shadow-[0_0_15px_rgba(201,162,74,0.15)] transition-transform duration-300 group-hover:scale-110 group-hover:bg-[var(--color-primary-gold)] group-hover:text-black relative">
                                {/* Step Number Badge */}
                                <div className="absolute -top-1 -right-1 w-7 h-7 bg-[var(--color-secondary-dark)] text-[var(--color-primary-gold)] font-bold font-body text-xs rounded-full flex items-center justify-center border border-[var(--color-primary-gold)] group-hover:border-black group-hover:text-black group-hover:bg-[var(--color-primary-gold)]">
                                    {step.id}
                                </div>
                                {step.icon}
                            </div>

                            <h3 className="text-lg font-heading font-medium text-[var(--color-text-light)]">
                                {step.title}
                            </h3>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default OrderSteps;
