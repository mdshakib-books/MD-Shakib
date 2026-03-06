import React from "react";
import heroImage from "../../assets/Home/hero1.png";

const HeroSection = () => {
    return (
        <section className="w-full relative">
            <div className="relative w-full h-[260px] md:h-[380px] lg:h-[500px] overflow-hidden group">
                <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105"
                    style={{
                        // backgroundImage: `url(${heroImage})`,
                        backgroundImage: `url("https://plus.unsplash.com/premium_photo-1677231559663-b9f6a7c33c77?q=80&w=3540&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D")`,
                    }}
                />

                {/* Dark Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/40"></div>

                {/* Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-4 pt-18 md:pt-28 lg:pt-32">
                    <p className="text-[var(--color-accent-gold)] text-xs md:text-sm tracking-[0.3em] uppercase opacity-90 font-medium font-body animate-pulse">
                        PRESENTING
                    </p>

                    <h2 className="font-heading text-[20px] md:text-[26px] lg:text-[32px] text-[#E5C87B] tracking-[0.1em] text-center mt-[10px] mb-4 md:mb-6 drop-shadow-[0_2px_15px_rgba(229,200,123,0.6)]">
                        محمد شکیب صدیقی
                    </h2>

                    <p className="text-gray-400 max-w-sm md:max-w-md text-xs md:text-sm font-light leading-relaxed">
                        May we all be showered with grace, guidance, and
                        blessings from Allah SWT.
                    </p>
                </div>
            </div>
        </section>
    );
};

export default HeroSection;
